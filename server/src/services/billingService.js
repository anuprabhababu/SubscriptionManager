import { randomUUID } from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { priceInvoice, roundMoney } from './pricingService.js';

const intervalMonths = { Monthly: 1, Quarterly: 3, Yearly: 12 };
const startOfDay = d => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function addBillingInterval(date, interval, anchorDay = date.getUTCDate()) {
  const months = intervalMonths[interval];
  if (!months) throw new Error('Unsupported billing interval');
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  monthStart.setUTCDate(Math.min(anchorDay, lastDay));
  return monthStart;
}

export async function createInvoiceForSubscription(tx, subscription, periodStart, options = {}) {
  const plan = await tx.plan.findUnique({ where: { id: subscription.planId } });
  if (!plan) throw new Error('Plan not found');
  const interval = subscription.billingInterval || plan.billingInterval;
  const periodEnd = addBillingInterval(periodStart, interval, subscription.billingAnchorDay);
  const unitPrice = subscription.unitPrice ?? plan.price;
  const planPricing = priceInvoice({ unitPrice, quantity: subscription.quantity, taxRate: 0 });
  const persistedLines = options.additionalLines ?? await tx.subscriptionLine.findMany({
    where: { subscriptionId: subscription.id },
    include: { product: true, variant: true },
  });
  const invoiceLines = [
    { description: options.planName || plan.name, productId: plan.productId || null, quantity: subscription.quantity, unitPrice, lineTotal: planPricing.subtotal, discountAmount: 0 },
    ...persistedLines.map(line => {
      const variantText = line.variant ? ` (${line.variant.attribute}: ${line.variant.value})` : '';
      return {
        description: line.description || `${line.product?.name || 'Additional product'}${variantText}`,
        productId: line.productId || null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: roundMoney(line.unitPrice * line.quantity),
        discountAmount: 0,
      };
    }),
  ];
  const now = new Date();
  const validDateStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const validRuleDate = { AND: [
    { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
    { OR: [{ validUntil: null }, { validUntil: { gte: validDateStart } }] },
  ] };
  const discountRules = await tx.discountRule.findMany({ where: { active: true, ...validRuleDate }, orderBy: { createdAt: 'asc' } });
  discountRules.sort((a,b)=>(a.scope==='PRODUCT'?0:1)-(b.scope==='PRODUCT'?0:1));
  const appliedDiscounts = [];
  for (const rule of discountRules) {
    if (rule.usageLimit != null && rule.usageCount >= rule.usageLimit) continue;
    const eligible = invoiceLines.map((line,index)=>({line,index})).filter(({line})=>rule.scope==='SUBSCRIPTION'||(line.productId&&line.productId===rule.productId));
    if (!eligible.length) continue;
    const grossEligible=roundMoney(eligible.reduce((sum,{line})=>sum+line.lineTotal,0));
    const eligibleQuantity=eligible.reduce((sum,{line})=>sum+line.quantity,0);
    if (rule.minimumAmount!=null&&grossEligible<rule.minimumAmount) continue;
    if (rule.minimumQuantity!=null&&eligibleQuantity<rule.minimumQuantity) continue;
    const remainingEligible=roundMoney(eligible.reduce((sum,{line})=>sum+line.lineTotal-line.discountAmount,0));
    if (remainingEligible<=0) continue;
    const amount=rule.type==='PERCENTAGE'?roundMoney(remainingEligible*rule.value/100):roundMoney(Math.min(rule.value,remainingEligible));
    if (amount<=0) continue;
    const reservation=await tx.discountRule.updateMany({where:{id:rule.id,active:true,...(rule.usageLimit==null?{}:{usageCount:{lt:rule.usageLimit}})},data:{usageCount:{increment:1}}});
    if (reservation.count!==1) continue;
    let allocated=0;
    eligible.forEach(({line},position)=>{
      const available=roundMoney(line.lineTotal-line.discountAmount);
      const share=position===eligible.length-1?roundMoney(amount-allocated):Math.min(available,roundMoney(amount*available/remainingEligible));
      const applied=Math.max(0,Math.min(available,share));
      line.discountAmount=roundMoney(line.discountAmount+applied);
      allocated=roundMoney(allocated+applied);
    });
    appliedDiscounts.push({discountRuleId:rule.id,ruleName:rule.name,amount:allocated});
  }
  const taxRules=await tx.taxRule.findMany({where:{active:true,...validRuleDate},orderBy:[{priority:'desc'},{createdAt:'desc'}]});
  for(const line of invoiceLines){
    const productRule=line.productId?taxRules.find(rule=>rule.scope==='PRODUCT'&&rule.productId===line.productId):null;
    const generalRule=taxRules.find(rule=>rule.scope==='ALL');
    line.taxRate=productRule?.rate??generalRule?.rate??subscription.taxRate??0;
    line.taxAmount=roundMoney(Math.max(0,line.lineTotal-line.discountAmount)*line.taxRate/100);
  }
  const subtotal=roundMoney(invoiceLines.reduce((sum,line)=>sum+line.lineTotal,0));
  const discountAmount=roundMoney(invoiceLines.reduce((sum,line)=>sum+line.discountAmount,0));
  const taxableSubtotal=roundMoney(subtotal-discountAmount);
  const taxAmount=roundMoney(invoiceLines.reduce((sum,line)=>sum+line.taxAmount,0));
  const total=roundMoney(taxableSubtotal+taxAmount);
  const effectiveTaxRate=taxableSubtotal>0?roundMoney(taxAmount/taxableSubtotal*100):0;
  const dueDate=new Date(periodStart);
  const netDays=subscription.paymentTerms?.match(/^net\s+(\d{1,3})(?:\s+days?)?$/i);
  const dueInDays=/due on receipt|immediate/i.test(subscription.paymentTerms||'')?0:netDays?Math.min(Number(netDays[1]),365):14;
  dueDate.setUTCDate(dueDate.getUTCDate()+dueInDays);
  dueDate.setUTCHours(23,59,59,999);
  const invoice=await tx.invoice.create({data:{
    subscriptionId:subscription.id,
    invoiceNumber: `INV-${periodStart.toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`,
    periodStart,periodEnd,issueDate:now,dueDate,status:'DRAFT',subtotal,discountAmount,taxRate:effectiveTaxRate,taxAmount,total,
    lines:{create:invoiceLines},
    discountApplications:{create:appliedDiscounts},
  },include:{lines:true,discountApplications:true}});
  return {invoice,periodEnd};
}

export async function runRecurringBilling(now = new Date()) {
  const today = startOfDay(now);
  await prisma.subscription.updateMany({ where: { status: 'ACTIVE', expiryDate: { lte: today } }, data: { status: 'EXPIRED' } });
  await prisma.invoice.updateMany({ where: { status: { in: ['CONFIRMED', 'PARTIAL'] }, dueDate: { lt: now } }, data: { status: 'OVERDUE' } });
  const due = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', nextBillingDate: { lte: now }, OR: [{ expiryDate: null }, { expiryDate: { gt: today } }] },
    select: { id: true },
  });
  let generated = 0;
  for (const { id } of due) {
    try {
      const didGenerate = await prisma.$transaction(async tx => {
        const current = await tx.subscription.findUnique({ where: { id }, include: { plan: true } });
        if (!current || current.status !== 'ACTIVE' || !current.nextBillingDate || current.nextBillingDate > now) return false;
        const periodStart = startOfDay(current.nextBillingDate);
        const { periodEnd } = await createInvoiceForSubscription(tx, current, periodStart);
        const next = current.expiryDate && current.expiryDate < periodEnd ? current.expiryDate : periodEnd;
        await tx.subscription.update({ where: { id }, data: { nextBillingDate: next } });
        return true;
      });
      if (didGenerate) generated += 1;
    } catch (error) {
      if (error.code !== 'P2002') throw error;
      // A prior run already issued this billing period; advance only if its pointer is still on that period.
      const current = await prisma.subscription.findUnique({ where: { id }, include: { plan: true } });
      if (current?.status === 'ACTIVE' && current.nextBillingDate) {
        const periodStart = startOfDay(current.nextBillingDate);
        const exists = await prisma.invoice.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: id, periodStart } } });
        if (exists) await prisma.subscription.updateMany({ where: { id, nextBillingDate: current.nextBillingDate }, data: { nextBillingDate: addBillingInterval(periodStart, current.billingInterval, current.billingAnchorDay) } });
      }
    }
  }
  return { generated, checked: due.length, overdueUpdated: true };
}

export async function recordPayment({ invoiceId, amount, method, reference, recordedBy }) {
  return prisma.$transaction(async tx => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 });
    if (invoice.status === 'DRAFT' || invoice.status === 'CANCELLED' || invoice.status === 'PAID') throw Object.assign(new Error('This invoice cannot accept payments'), { status: 409 });
    const balance = roundMoney(invoice.total - invoice.amountPaid);
    const paymentAmount = roundMoney(amount);
    if (paymentAmount <= 0 || paymentAmount > balance) throw Object.assign(new Error(`Payment must be greater than zero and no more than the outstanding balance (${balance.toFixed(2)})`), { status: 400 });
    const payment = await tx.payment.create({ data: { invoiceId, amount: paymentAmount, method, reference: reference || null, recordedBy } });
    const amountPaid = roundMoney(invoice.amountPaid + paymentAmount);
    const fullyPaid = amountPaid >= invoice.total;
    const overdue = invoice.dueDate < new Date();
    await tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid, status: fullyPaid ? 'PAID' : overdue ? 'OVERDUE' : 'PARTIAL' } });
    return payment;
  });
}

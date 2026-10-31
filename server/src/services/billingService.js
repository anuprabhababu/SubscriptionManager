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

export async function createInvoiceForSubscription(tx, subscription, periodStart) {
  const plan = await tx.plan.findUnique({ where: { id: subscription.planId } });
  if (!plan) throw new Error('Plan not found');
  const periodEnd = addBillingInterval(periodStart, subscription.billingInterval || plan.billingInterval, subscription.billingAnchorDay);
  const unitPrice = subscription.unitPrice ?? plan.price;
  const { subtotal, taxAmount, total } = priceInvoice({ unitPrice, quantity: subscription.quantity, taxRate: subscription.taxRate });
  const dueDate = new Date(periodStart);
  dueDate.setUTCDate(dueDate.getUTCDate() + 14);
  dueDate.setUTCHours(23, 59, 59, 999);
  const invoice = await tx.invoice.create({
    data: {
      subscriptionId: subscription.id,
      invoiceNumber: `INV-${periodStart.toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
      periodStart,
      periodEnd,
      issueDate: new Date(),
      dueDate,
      subtotal,
      taxRate: subscription.taxRate,
      taxAmount,
      total,
      lines: { create: [{ description: plan.name, quantity: subscription.quantity, unitPrice, lineTotal: subtotal }] },
    },
    include: { lines: true },
  });
  return { invoice, periodEnd };
}

export async function runRecurringBilling(now = new Date()) {
  const today = startOfDay(now);
  await prisma.subscription.updateMany({ where: { status: 'ACTIVE', expiryDate: { lte: today } }, data: { status: 'EXPIRED' } });
  await prisma.invoice.updateMany({ where: { status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: now } }, data: { status: 'OVERDUE' } });
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
    if (invoice.status === 'VOID' || invoice.status === 'PAID') throw Object.assign(new Error('This invoice cannot accept payments'), { status: 409 });
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

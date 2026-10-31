import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { createInvoiceForSubscription, recordPayment, runRecurringBilling } from '../services/billingService.js';
import { roundMoney } from '../services/pricingService.js';

const dateOnly = value => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
const createSchema = z.object({ customerId: z.string().min(1), planId: z.string().min(1), startDate: z.coerce.date().optional(), expiryDate: z.preprocess(v => !v ? undefined : v, z.coerce.date().optional()), quantity: z.coerce.number().int().min(1).max(100000).default(1), taxRate: z.coerce.number().min(0).max(100).default(0) });
const paymentSchema = z.object({ amount: z.coerce.number().finite().positive(), method: z.enum(['Cash', 'Bank transfer', 'Card', 'Other']), reference: z.string().trim().max(120).optional() });

export async function createSubscription(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid subscription details' });
  const input = parsed.data;
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const startDate = dateOnly(input.startDate || new Date());
  const expiryDate = input.expiryDate ? dateOnly(input.expiryDate) : null;
  if (input.quantity < plan.minimumQuantity) return res.status(400).json({ error: `This plan requires at least ${plan.minimumQuantity} units` });
  if (expiryDate && expiryDate <= startDate) return res.status(400).json({ error: 'Expiry date must be after the start date' });
  if (plan.availableFrom && startDate < dateOnly(plan.availableFrom)) return res.status(400).json({ error: 'This plan is not available yet' });
  if (plan.availableUntil && startDate > dateOnly(plan.availableUntil)) return res.status(400).json({ error: 'This plan is no longer available' });
  const subscription = await prisma.$transaction(async tx => {
    const created = await tx.subscription.create({ data: {
      customerId: customer.id, planId: plan.id,
      subscriptionNumber: `SUB-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
      startDate, expiryDate, nextBillingDate: startDate, status: 'ACTIVE', quantity: input.quantity, unitPrice: plan.price, billingInterval: plan.billingInterval,
      taxRate: input.taxRate, billingAnchorDay: startDate.getUTCDate(),
    } });
    const { periodEnd } = await createInvoiceForSubscription(tx, created, startDate);
    await tx.subscription.update({ where: { id: created.id }, data: { nextBillingDate: expiryDate && expiryDate < periodEnd ? expiryDate : periodEnd } });
    return tx.subscription.findUnique({ where: { id: created.id }, include: { customer: true, plan: true, invoices: { include: { lines: true } } } });
  });
  res.status(201).json(subscription);
}

export async function updateSubscriptionStatus(req, res) {
  const parsed = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Status must be ACTIVE, PAUSED, or CANCELLED' });
  const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Subscription not found' });
  const data = { status: parsed.data.status };
  if (data.status === 'CANCELLED') data.nextBillingDate = null;
  if (data.status === 'ACTIVE' && existing.status === 'PAUSED' && existing.nextBillingDate < new Date()) data.nextBillingDate = new Date();
  const updated = await prisma.subscription.update({ where: { id: existing.id }, data, include: { customer: true, plan: true } });
  res.json(updated);
}

export async function listInvoices(req, res) {
  const customerScope = req.user.role === 'CUSTOMER' ? { subscription: { customer: { userId: req.user.sub } } } : {};
  await prisma.invoice.updateMany({ where: { ...customerScope, status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: new Date() } }, data: { status: 'OVERDUE' } });
  res.json(await prisma.invoice.findMany({ where: customerScope, include: { subscription: { include: { customer: true, plan: true } }, lines: true, payments: true }, orderBy: { issueDate: 'desc' } }));
}

export async function getInvoice(req, res) {
  const where = req.user.role === 'CUSTOMER' ? { id: req.params.id, subscription: { customer: { userId: req.user.sub } } } : { id: req.params.id };
  const invoice = await prisma.invoice.findFirst({ where, include: { subscription: { include: { customer: true, plan: true } }, lines: true, payments: { orderBy: { paidAt: 'desc' } } } });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json(invoice);
}

export async function addPayment(req, res) {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid payment details' });
  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, ...(req.user.role === 'CUSTOMER' ? { subscription: { customer: { userId: req.user.sub } } } : {}) } });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  try {
    const payment = await recordPayment({ ...parsed.data, invoiceId: invoice.id, recordedBy: req.user.sub });
    res.status(201).json(payment);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
}

export async function listPayments(req, res) {
  const where = req.user.role === 'CUSTOMER' ? { invoice: { subscription: { customer: { userId: req.user.sub } } } } : {};
  res.json(await prisma.payment.findMany({ where, include: { invoice: { include: { subscription: { include: { customer: true, plan: true } } } } }, orderBy: { paidAt: 'desc' } }));
}

export async function billingRun(req, res) {
  res.json(await runRecurringBilling());
}

export async function dashboard(req, res) {
  const customerScope = req.user.role === 'CUSTOMER' ? { subscription: { customer: { userId: req.user.sub } } } : {};
  const subscriptionScope = req.user.role === 'CUSTOMER' ? { customer: { userId: req.user.sub } } : {};
  await prisma.invoice.updateMany({ where: { ...customerScope, status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: new Date() } }, data: { status: 'OVERDUE' } });
  const [customers, products, plans, activeSubscriptions, invoices, payments, activePlans] = await Promise.all([
    req.user.role === 'CUSTOMER' ? prisma.customer.count({ where: { userId: req.user.sub } }) : prisma.customer.count(),
    prisma.product.count(), prisma.plan.count(),
    prisma.subscription.count({ where: { ...subscriptionScope, status: 'ACTIVE' } }),
    prisma.invoice.findMany({ where: { ...customerScope, status: { not: 'VOID' } }, select: { total: true, amountPaid: true, status: true } }),
    prisma.payment.aggregate({ where: req.user.role === 'CUSTOMER' ? { invoice: customerScope } : {}, _sum: { amount: true } }),
    prisma.subscription.findMany({ where: { ...subscriptionScope, status: 'ACTIVE' }, include: { plan: true } }),
  ]);
  const monthlyFactor = { Monthly: 1, Quarterly: 1 / 3, Yearly: 1 / 12 };
  res.json({
    customers, products, plans, activeSubscriptions,
    subscriptions: await prisma.subscription.count({ where: subscriptionScope }),
    invoices: invoices.length,
    overdueInvoices: invoices.filter(invoice => invoice.status === 'OVERDUE').length,
    outstanding: roundMoney(invoices.reduce((sum, invoice) => sum + invoice.total - invoice.amountPaid, 0)),
    collected: roundMoney(payments._sum.amount || 0),
    monthlyRecurringRevenue: roundMoney(activePlans.reduce((sum, item) => sum + item.unitPrice * item.quantity * (monthlyFactor[item.billingInterval] || 0), 0)),
  });
}

export async function portal(req, res) {
  if (req.user.role !== 'CUSTOMER') return res.status(403).json({ error: 'Customer portal is for customer accounts' });
  const invoiceScope = { subscription: { customer: { userId: req.user.sub } } };
  await prisma.invoice.updateMany({ where: { ...invoiceScope, status: { in: ['OPEN', 'PARTIAL'] }, dueDate: { lt: new Date() } }, data: { status: 'OVERDUE' } });
  const [customer, subscriptions, invoices, totals] = await Promise.all([
    prisma.customer.findUnique({ where: { userId: req.user.sub } }),
    prisma.subscription.findMany({ where: { customer: { userId: req.user.sub } }, include: { plan: true, invoices: { orderBy: { issueDate: 'desc' }, take: 5 } }, orderBy: { createdAt: 'desc' } }),
    prisma.invoice.findMany({ where: invoiceScope, include: { subscription: { include: { plan: true } }, lines: true, payments: true }, orderBy: { issueDate: 'desc' }, take: 10 }),
    prisma.invoice.aggregate({ where: { ...invoiceScope, status: { not: 'VOID' } }, _sum: { total: true, amountPaid: true } }),
  ]);
  res.json({ customer, subscriptions, invoices, outstanding: roundMoney((totals._sum.total || 0) - (totals._sum.amountPaid || 0)) });
}

export async function subscriptionList(req, res) {
  const where = req.user.role === 'CUSTOMER' ? { customer: { userId: req.user.sub } } : {};
  res.json(await prisma.subscription.findMany({ where, include: { customer: true, plan: true, lines: { include: { product: true, variant: true } }, invoices: { orderBy: { issueDate: 'desc' } } }, orderBy: { createdAt: 'desc' } }));
}

export async function subscriptionDetail(req, res) {
  const where = req.user.role === 'CUSTOMER' ? { id: req.params.id, customer: { userId: req.user.sub } } : { id: req.params.id };
  const item = await prisma.subscription.findFirst({ where, include: { customer: true, plan: true, lines: { include: { product: true, variant: true } }, invoices: { include: { lines: true, payments: true }, orderBy: { issueDate: 'desc' } } } });
  if (!item) return res.status(404).json({ error: 'Subscription not found' });
  res.json(item);
}

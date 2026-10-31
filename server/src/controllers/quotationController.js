import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { createInvoiceForSubscription } from '../services/billingService.js';
import { roundMoney } from '../services/pricingService.js';

const optionalDate = z.preprocess(value => value === '' || value == null ? undefined : value, z.coerce.date().optional());
const paymentTermsSchema = z.string().trim().min(1).max(100).refine(value => {
  if (/^(due on receipt|immediate)$/i.test(value)) return true;
  const match = value.match(/^net\s+(\d{1,3})(?:\s+days?)?$/i);
  return Boolean(match && Number(match[1]) <= 365);
}, 'Use Net N days, Due on receipt, or Immediate (maximum 365 days)');
const lineInput = z.object({
  productId: z.string().min(1),
  variantId: z.preprocess(value => value === '' ? undefined : value, z.string().min(1).optional()),
  description: z.string().trim().max(200).optional(),
  quantity: z.coerce.number().int().min(1).max(100000).default(1),
  unitPrice: z.coerce.number().finite().min(0).optional(),
});
const quoteInput = z.object({
  customerId: z.string().min(1),
  planId: z.string().min(1),
  planQuantity: z.coerce.number().int().min(1).max(100000).default(1),
  planUnitPrice: z.coerce.number().finite().min(0).optional(),
  lines: z.array(lineInput).max(100).default([]),
  startDate: z.coerce.date(),
  expiryDate: optionalDate,
  validUntil: optionalDate,
  paymentTerms: paymentTermsSchema.default('Net 14 days'),
  taxRate: z.coerce.number().finite().min(0).max(100).default(0),
});
const templateInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.preprocess(value => value === '' ? undefined : value, z.string().trim().max(500).optional()),
  planId: z.string().min(1),
  planQuantity: z.coerce.number().int().min(1).max(100000).default(1),
  planUnitPrice: z.coerce.number().finite().min(0).optional(),
  lines: z.array(lineInput).max(100).default([]),
  taxRate: z.coerce.number().finite().min(0).max(100).default(0),
  paymentTerms: paymentTermsSchema.default('Net 14 days'),
});
const includeQuotation = {
  customer: { include: { user: { select: { id: true, name: true, email: true } } } },
  plan: true,
  lines: { include: { product: { select: { id: true, name: true, type: true, salesPrice: true } }, variant: { select: { id: true, attribute: true, value: true, additionalPrice: true } } }, orderBy: { createdAt: 'asc' } },
  convertedSubscription: { select: { id: true, subscriptionNumber: true, status: true } },
};
const includeTemplate = {
  plan: true,
  lines: { include: { product: true, variant: true }, orderBy: { createdAt: 'asc' } },
};
const dateOnly = value => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
const today = () => dateOnly(new Date());
const toError = (res, error, fallback = 'Request could not be completed') => {
  const status = error.status || (error.code === 'P2002' ? 409 : 400);
  return res.status(status).json({ error: error.message || fallback });
};

async function resolvePlan(tx, input) {
  const plan = await tx.plan.findUnique({ where: { id: input.planId } });
  if (!plan) throw Object.assign(new Error('Plan not found'), { status: 404 });
  if (input.planQuantity < plan.minimumQuantity) throw Object.assign(new Error(`This plan requires at least ${plan.minimumQuantity} units`), { status: 400 });
  const planUnitPrice = input.planUnitPrice ?? plan.price;
  if (!Number.isFinite(planUnitPrice) || planUnitPrice < 0) throw Object.assign(new Error('Invalid plan unit price'), { status: 400 });
  return { plan, planUnitPrice };
}

async function resolveLines(tx, items) {
  const lines = [];
  for (const item of items) {
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    if (!product) throw Object.assign(new Error(`Product not found: ${item.productId}`), { status: 404 });
    let variant = null;
    if (item.variantId) {
      variant = await tx.productVariant.findFirst({ where: { id: item.variantId, productId: product.id } });
      if (!variant) throw Object.assign(new Error('Product variant not found'), { status: 400 });
    }
    const unitPrice = item.unitPrice ?? product.salesPrice + (variant?.additionalPrice || 0);
    const description = item.description || (variant ? `${product.name} (${variant.attribute}: ${variant.value})` : product.name);
    lines.push({ productId: product.id, variantId: variant?.id || null, description, quantity: item.quantity, unitPrice, lineTotal: roundMoney(unitPrice * item.quantity) });
  }
  return lines;
}

function totals(planUnitPrice, planQuantity, lines, taxRate) {
  const subtotal = roundMoney(planUnitPrice * planQuantity + lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const taxAmount = roundMoney(subtotal * taxRate / 100);
  return { subtotal, taxAmount, total: roundMoney(subtotal + taxAmount) };
}

function validateDates(input) {
  const startDate = dateOnly(input.startDate);
  const expiryDate = input.expiryDate ? dateOnly(input.expiryDate) : null;
  const validUntil = input.validUntil ? dateOnly(input.validUntil) : null;
  if (expiryDate && expiryDate <= startDate) throw Object.assign(new Error('Subscription expiry must be after its start date'), { status: 400 });
  if (validUntil && validUntil < today()) throw Object.assign(new Error('Quotation validity date cannot be in the past'), { status: 400 });
  return { startDate, expiryDate, validUntil };
}

function quotationNumber() {
  return `QUO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function expireOutdatedQuotations() {
  await prisma.quotation.updateMany({
    where: { status: 'QUOTATION', validUntil: { lt: today() }, convertedSubscriptionId: null },
    data: { status: 'EXPIRED' },
  });
}

export async function listQuotations(req, res) {
  await expireOutdatedQuotations();
  const where = req.user.role === 'CUSTOMER' ? { customer: { userId: req.user.sub } } : {};
  res.json(await prisma.quotation.findMany({ where, include: includeQuotation, orderBy: { createdAt: 'desc' } }));
}

export async function getQuotation(req, res) {
  await expireOutdatedQuotations();
  const where = req.user.role === 'CUSTOMER' ? { id: req.params.id, customer: { userId: req.user.sub } } : { id: req.params.id };
  const quotation = await prisma.quotation.findFirst({ where, include: includeQuotation });
  if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
  res.json(quotation);
}

export async function createQuotation(req, res) {
  const parsed = quoteInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid quotation details' });
  try {
    const quotation = await prisma.$transaction(async tx => {
      const input = parsed.data;
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
      const { plan, planUnitPrice } = await resolvePlan(tx, input);
      const { startDate, expiryDate, validUntil } = validateDates(input);
      if (plan.availableFrom && startDate < dateOnly(plan.availableFrom)) throw Object.assign(new Error('This plan is not available yet'), { status: 400 });
      if (plan.availableUntil && startDate > dateOnly(plan.availableUntil)) throw Object.assign(new Error('This plan is no longer available'), { status: 400 });
      const lines = await resolveLines(tx, input.lines);
      const amount = totals(planUnitPrice, input.planQuantity, lines, input.taxRate);
      return tx.quotation.create({ data: {
        quotationNumber: quotationNumber(), customerId: customer.id, planId: plan.id,
        status: 'DRAFT', planName: plan.name, billingInterval: plan.billingInterval,
        planQuantity: input.planQuantity, planUnitPrice, startDate, expiryDate, validUntil,
        paymentTerms: input.paymentTerms, taxRate: input.taxRate, ...amount,
        lines: { create: lines },
      }, include: includeQuotation });
    });
    res.status(201).json(quotation);
  } catch (error) { toError(res, error, 'Could not create quotation'); }
}

export async function updateQuotation(req, res) {
  const parsed = quoteInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid quotation details' });
  try {
    const quotation = await prisma.$transaction(async tx => {
      const current = await tx.quotation.findUnique({ where: { id: req.params.id } });
      if (!current) throw Object.assign(new Error('Quotation not found'), { status: 404 });
      if (!['DRAFT', 'QUOTATION'].includes(current.status) || current.convertedSubscriptionId) throw Object.assign(new Error('Only draft or issued quotations can be edited'), { status: 409 });
      const input = parsed.data;
      if (!await tx.customer.findUnique({ where: { id: input.customerId } })) throw Object.assign(new Error('Customer not found'), { status: 404 });
      const { plan, planUnitPrice } = await resolvePlan(tx, input);
      const { startDate, expiryDate, validUntil } = validateDates(input);
      if (plan.availableFrom && startDate < dateOnly(plan.availableFrom)) throw Object.assign(new Error('This plan is not available yet'), { status: 400 });
      if (plan.availableUntil && startDate > dateOnly(plan.availableUntil)) throw Object.assign(new Error('This plan is no longer available'), { status: 400 });
      const lines = await resolveLines(tx, input.lines);
      const amount = totals(planUnitPrice, input.planQuantity, lines, input.taxRate);
      await tx.quotation.update({ where: { id: current.id }, data: {
        customerId: input.customerId, planId: plan.id, planName: plan.name, billingInterval: plan.billingInterval,
        planQuantity: input.planQuantity, planUnitPrice, startDate, expiryDate, validUntil,
        paymentTerms: input.paymentTerms, taxRate: input.taxRate, ...amount,
        lines: { deleteMany: {}, create: lines },
      } });
      return tx.quotation.findUnique({ where: { id: current.id }, include: includeQuotation });
    });
    res.json(quotation);
  } catch (error) { toError(res, error, 'Could not update quotation'); }
}

export async function updateQuotationStatus(req, res) {
  const parsed = z.object({ status: z.enum(['QUOTATION', 'CONFIRMED', 'REJECTED', 'EXPIRED']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid quotation status' });
  const quotation = await prisma.quotation.findUnique({ where: { id: req.params.id } });
  if (!quotation) return res.status(404).json({ error: 'Quotation not found' });
  if (quotation.convertedSubscriptionId) return res.status(409).json({ error: 'A converted quotation cannot change status' });
  const transitions = { DRAFT: ['QUOTATION', 'REJECTED'], QUOTATION: ['CONFIRMED', 'REJECTED', 'EXPIRED'] };
  if (!transitions[quotation.status]?.includes(parsed.data.status)) return res.status(409).json({ error: `Cannot change a ${quotation.status} quotation to ${parsed.data.status}` });
  if (parsed.data.status === 'CONFIRMED' && quotation.validUntil && dateOnly(quotation.validUntil) < today()) return res.status(409).json({ error: 'This quotation has expired' });
  const updated = await prisma.quotation.update({ where: { id: quotation.id }, data: { status: parsed.data.status }, include: includeQuotation });
  res.json(updated);
}

export async function convertQuotation(req, res) {
  try {
    const result = await prisma.$transaction(async tx => {
      const quotation = await tx.quotation.findUnique({ where: { id: req.params.id }, include: { lines: true, plan: true } });
      if (!quotation) throw Object.assign(new Error('Quotation not found'), { status: 404 });
      if (quotation.convertedSubscriptionId) throw Object.assign(new Error('This quotation has already been converted'), { status: 409 });
      if (quotation.status !== 'CONFIRMED') throw Object.assign(new Error('Only confirmed quotations can be converted'), { status: 409 });
      if (quotation.lines.some(line => !line.productId)) throw Object.assign(new Error('A quoted product is no longer available; update the quotation before conversion'), { status: 409 });
      const startDate = dateOnly(quotation.startDate);
      const expiryDate = quotation.expiryDate ? dateOnly(quotation.expiryDate) : null;
      const created = await tx.subscription.create({ data: {
        customerId: quotation.customerId,
        planId: quotation.planId,
        subscriptionNumber: `SUB-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
        startDate,
        expiryDate,
        nextBillingDate: startDate,
        status: 'ACTIVE',
        quantity: quotation.planQuantity,
        unitPrice: quotation.planUnitPrice,
        billingInterval: quotation.billingInterval,
        taxRate: quotation.taxRate,
        billingAnchorDay: startDate.getUTCDate(),
        paymentTerms: quotation.paymentTerms,
        lines: { create: quotation.lines.map(line => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity, unitPrice: line.unitPrice })) },
      } });
      const additionalLines = quotation.lines.map(line => ({ description: line.description, productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice }));
      const { invoice, periodEnd } = await createInvoiceForSubscription(tx, created, startDate, { additionalLines, planName: quotation.planName });
      const nextBillingDate = expiryDate && expiryDate < periodEnd ? expiryDate : periodEnd;
      await tx.subscription.update({ where: { id: created.id }, data: { nextBillingDate } });
      const attached = await tx.quotation.updateMany({
        where: { id: quotation.id, status: 'CONFIRMED', convertedSubscriptionId: null },
        data: { convertedSubscriptionId: created.id },
      });
      if (attached.count !== 1) throw Object.assign(new Error('This quotation was converted by another request'), { status: 409 });
      return { subscription: await tx.subscription.findUnique({ where: { id: created.id }, include: { customer: true, plan: true, lines: { include: { product: true, variant: true } }, invoices: { include: { lines: true } } } }), invoice };
    });
    res.status(201).json(result);
  } catch (error) { toError(res, error, 'Could not convert quotation'); }
}

export async function listQuotationTemplates(req, res) {
  res.json(await prisma.quotationTemplate.findMany({ include: includeTemplate, orderBy: { name: 'asc' } }));
}

export async function createQuotationTemplate(req, res) {
  const parsed = templateInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid template details' });
  try {
    const template = await prisma.$transaction(async tx => {
      const input = parsed.data;
      const { plan, planUnitPrice } = await resolvePlan(tx, input);
      const lines = await resolveLines(tx, input.lines);
      return tx.quotationTemplate.create({ data: {
        name: input.name, description: input.description || null, planId: plan.id,
        planQuantity: input.planQuantity, planUnitPrice, taxRate: input.taxRate, paymentTerms: input.paymentTerms,
        lines: { create: lines.map(({ productId, variantId, description, quantity, unitPrice }) => ({ productId, variantId, description, quantity, unitPrice })) },
      }, include: includeTemplate });
    });
    res.status(201).json(template);
  } catch (error) { toError(res, error, 'Could not create quotation template'); }
}

export async function updateQuotationTemplate(req, res) {
  const parsed = templateInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid template details' });
  try {
    const template = await prisma.$transaction(async tx => {
      const current = await tx.quotationTemplate.findUnique({ where: { id: req.params.id } });
      if (!current) throw Object.assign(new Error('Quotation template not found'), { status: 404 });
      const input = parsed.data;
      const { plan, planUnitPrice } = await resolvePlan(tx, input);
      const lines = await resolveLines(tx, input.lines);
      await tx.quotationTemplate.update({ where: { id: current.id }, data: {
        name: input.name, description: input.description || null, planId: plan.id,
        planQuantity: input.planQuantity, planUnitPrice, taxRate: input.taxRate, paymentTerms: input.paymentTerms,
        lines: { deleteMany: {}, create: lines.map(({ productId, variantId, description, quantity, unitPrice }) => ({ productId, variantId, description, quantity, unitPrice })) },
      } });
      return tx.quotationTemplate.findUnique({ where: { id: current.id }, include: includeTemplate });
    });
    res.json(template);
  } catch (error) { toError(res, error, 'Could not update quotation template'); }
}

export async function deleteQuotationTemplate(req, res) {
  try {
    await prisma.quotationTemplate.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) { res.status(error.code === 'P2025' ? 404 : 400).json({ error: error.code === 'P2025' ? 'Quotation template not found' : 'Could not delete quotation template' }); }
}


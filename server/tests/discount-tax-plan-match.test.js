import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let prisma;
let createInvoiceForSubscription;
let tempDir;
let previousDatabaseUrl;

before(async () => {
  tempDir = mkdtempSync(path.join(serverDir, 'prisma', '.discount-tax-test-'));
  const databasePath = path.join(tempDir, 'test.db');
  writeFileSync(databasePath, '');
  const relativeDbPath = path.relative(path.join(serverDir, 'prisma'), databasePath).replaceAll('\\', '/');
  const databaseUrl = `file:./${relativeDbPath}`;
  previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  execFileSync(process.execPath, [
    path.join(serverDir, 'node_modules', 'prisma', 'build', 'index.js'),
    'migrate', 'deploy', '--schema', path.join(serverDir, 'prisma', 'schema.prisma'),
  ], { cwd: serverDir, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
  const { PrismaClient } = await import('@prisma/client');
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  ({ createInvoiceForSubscription } = await import('../src/services/billingService.js'));
});

after(async () => {
  await prisma?.$disconnect();
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

test('mapped $5,000 plan invoice gets its product discount and tax', async () => {
  const suffix = Date.now().toString();
  const discountName = `Launch Discount regression ${suffix}`;
  const product = await prisma.product.create({ data: {
    name: `Odoo Subscription ${suffix}`, type: 'Service', salesPrice: 5000, costPrice: 0,
  } });
  const plan = await prisma.plan.create({ data: {
    name: `Odoo Monthly ${suffix}`, price: 5000, billingInterval: 'Monthly', productId: product.id,
  } });
  const customer = await prisma.customer.create({ data: { companyName: 'Isolated billing test' } });
  const now = new Date();
  await prisma.discountRule.create({ data: {
    name: discountName, type: 'PERCENTAGE', scope: 'PRODUCT', productId: product.id,
    value: 10, minimumAmount: 0, minimumQuantity: 1, usageLimit: 5, active: true,
  } });
  await prisma.taxRule.create({ data: {
    name: `GST regression ${suffix}`, scope: 'PRODUCT', productId: product.id, rate: 18, priority: 1, active: true,
  } });
  const invoice = await prisma.$transaction(async tx => {
    const subscription = await tx.subscription.create({ data: {
      customerId: customer.id, planId: plan.id, subscriptionNumber: `SUB-ISOLATED-PLAN-PRODUCT-${suffix}`,
      startDate: now, nextBillingDate: now, quantity: 1, unitPrice: 5000,
      billingInterval: 'Monthly', taxRate: 0, billingAnchorDay: now.getUTCDate(),
    } });
    return (await createInvoiceForSubscription(tx, subscription, now)).invoice;
  });
  assert.equal(invoice.subtotal, 5000);
  assert.equal(invoice.discountAmount, 500);
  assert.equal(invoice.taxAmount, 810);
  assert.equal(invoice.total, 5310);
  assert.equal(invoice.lines[0].productId, product.id);
  assert.equal(invoice.lines[0].taxRate, 18);
  assert.equal(invoice.discountApplications[0].ruleName, discountName);
});



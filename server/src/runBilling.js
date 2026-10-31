import 'dotenv/config';
import { runRecurringBilling } from './services/billingService.js';
import { prisma } from './config/prisma.js';

try {
  console.log(await runRecurringBilling());
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

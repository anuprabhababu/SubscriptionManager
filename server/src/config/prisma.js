import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
// Neon and other remote databases can take longer than Prisma's 5 second
// interactive transaction default, especially while a free-tier compute wakes.
export const transactionOptions = { maxWait: 10_000, timeout: 30_000 };

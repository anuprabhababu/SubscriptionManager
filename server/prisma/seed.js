import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const { ADMIN_NAME = 'Subscriptly Admin', ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD before seeding the administrator.');
}
if (ADMIN_PASSWORD.length < 9 || !/[a-z]/.test(ADMIN_PASSWORD) || !/[A-Z]/.test(ADMIN_PASSWORD) || !/[^A-Za-z0-9]/.test(ADMIN_PASSWORD)) {
  throw new Error('ADMIN_PASSWORD must be 9+ characters and include lowercase, uppercase, and a special character.');
}

const prisma = new PrismaClient();
try {
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== 'ADMIN') {
    throw new Error('ADMIN_EMAIL is already used by a non-admin account. Choose a different email.');
  }
  if (!existing) {
    await prisma.user.create({
      data: {
        name: ADMIN_NAME.trim() || 'Subscriptly Admin',
        email,
        password: await bcrypt.hash(ADMIN_PASSWORD, 12),
        role: 'ADMIN',
      },
    });
    console.log(`Administrator created: ${email}`);
  } else {
    console.log(`Administrator already exists: ${email}`);
  }
} finally {
  await prisma.$disconnect();
}

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import {PrismaClient} from '@prisma/client';
const prisma=new PrismaClient();
const email='admin@subscriptly.local';
await prisma.user.upsert({where:{email},update:{},create:{name:'Subscriptly Admin',email,password:await bcrypt.hash('Admin123!ChangeMe',12),role:'ADMIN'}});
console.log(`Demo admin ready: ${email}`);await prisma.$disconnect();

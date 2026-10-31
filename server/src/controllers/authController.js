import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {z} from 'zod';
import {prisma} from '../config/prisma.js';
const registerSchema=z.object({name:z.string().trim().min(2).max(100),email:z.string().trim().email().transform(v=>v.toLowerCase()),password:z.string().min(9).regex(/[a-z]/).regex(/[A-Z]/).regex(/[^A-Za-z0-9]/)});
const publicUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role});
const issue=(u)=>({token:jwt.sign({sub:u.id,role:u.role},process.env.JWT_SECRET,{expiresIn:'12h'}),user:publicUser(u)});
export async function register(req,res){try{const data=registerSchema.parse(req.body);const user=await prisma.user.create({data:{...data,password:await bcrypt.hash(data.password,12),role:'CUSTOMER',customer:{create:{companyName:data.name}}}});res.status(201).json(issue(user));}catch(e){if(e.code==='P2002')return res.status(409).json({error:'An account with this email already exists'});res.status(400).json({error:e.issues?.[0]?.message||'Invalid registration details'});}}
export async function login(req,res){const email=String(req.body.email||'').trim().toLowerCase();const user=await prisma.user.findUnique({where:{email}});if(!user||!await bcrypt.compare(String(req.body.password||''),user.password))return res.status(401).json({error:'Email or password is incorrect'});res.json(issue(user));}
export async function createStaff(req,res){try{const data=registerSchema.parse(req.body);const user=await prisma.user.create({data:{...data,password:await bcrypt.hash(data.password,12),role:'STAFF'}});res.status(201).json({user:publicUser(user)});}catch(e){res.status(e.code==='P2002'?409:400).json({error:e.issues?.[0]?.message||'Could not create staff account'});}}
export async function me(req,res){const user=await prisma.user.findUnique({where:{id:req.user.sub}});if(!user)return res.status(401).json({error:'Account not found'});res.json({user:publicUser(user)});}

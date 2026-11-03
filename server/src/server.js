import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {authenticate} from './middleware/authMiddleware.js';
import {allowRoles} from './middleware/roleMiddleware.js';
import {register,login,createStaff,me} from './controllers/authController.js';
import {resource,variants} from './controllers/resourceController.js';
import billingRoutes from './routes/billingRoutes.js';
import quotationRoutes from './routes/quotationRoutes.js';
import financeRoutes from './routes/financeRoutes.js';
import {runRecurringBilling} from './services/billingService.js';
if(!process.env.JWT_SECRET||process.env.JWT_SECRET==='replace-with-a-long-random-secret'||process.env.JWT_SECRET.length<32){throw new Error('Set JWT_SECRET to a random secret with at least 32 characters before starting the API.');}
const app=express();app.use(cors({origin:process.env.CLIENT_ORIGIN||'http://localhost:5173'}));app.use(express.json({limit:'1mb'}));
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
app.get('/api/health',(req,res)=>res.json({ok:true}));app.post('/api/auth/register',wrap(register));app.post('/api/auth/login',wrap(login));
app.use('/api',authenticate);app.use('/api',quotationRoutes);app.use('/api',financeRoutes);app.get('/api/auth/me',wrap(me));app.post('/api/auth/staff',allowRoles('ADMIN'),wrap(createStaff));app.use('/api',billingRoutes);
for(const name of ['customers','products','plans']){const r=resource(name);const router=express.Router();const roles=['ADMIN','STAFF'];router.get('/',wrap(r.list));router.get('/:id',wrap(r.get));router.post('/',allowRoles(...roles),wrap(r.create));router.put('/:id',allowRoles(...roles),wrap(r.update));router.delete('/:id',allowRoles(...roles),wrap(r.remove));app.use(`/api/${name}`,router);}
app.get('/api/products/:productId/variants',wrap(variants));app.post('/api/products/:productId/variants',allowRoles('ADMIN','STAFF'),wrap(variants));app.put('/api/products/:productId/variants/:variantId',allowRoles('ADMIN','STAFF'),wrap(variants));app.delete('/api/products/:productId/variants/:variantId',allowRoles('ADMIN','STAFF'),wrap(variants));
if(process.env.NODE_ENV==='production'){
  const clientDist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../client/dist');
  app.use((req,res,next)=>req.path.startsWith('/api/')?next():express.static(clientDist)(req,res,next));
  app.get('*',(req,res,next)=>req.path.startsWith('/api/')?next():res.sendFile(path.join(clientDist,'index.html'),error=>error&&next(error)));
}
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'An unexpected server error occurred'});});
const port=Number(process.env.PORT)||4000;app.listen(port,'0.0.0.0',()=>{console.log(`Subscriptly API listening on ${port}`);runRecurringBilling().catch(error=>console.error('Initial billing run failed:',error.message));const timer=setInterval(()=>runRecurringBilling().catch(error=>console.error('Recurring billing run failed:',error.message)),60_000);timer.unref();});

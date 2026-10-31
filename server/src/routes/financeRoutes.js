import { Router } from 'express';
import { allowRoles } from '../middleware/roleMiddleware.js';
import { discounts, taxes } from '../controllers/financeController.js';
const router=Router(); const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next); const admin=allowRoles('ADMIN');
for(const [path,handlers] of [['/discount-rules',discounts],['/tax-rules',taxes]]) {router.get(path,admin,wrap(handlers.list));router.post(path,admin,wrap(handlers.create));router.put(`${path}/:id`,admin,wrap(handlers.update));router.delete(`${path}/:id`,admin,wrap(handlers.remove));}
export default router;

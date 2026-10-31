import { Router } from 'express';
import { allowRoles } from '../middleware/roleMiddleware.js';
import { addPayment, billingRun, createSubscription, dashboard, getInvoice, listInvoices, listPayments, portal, subscriptionDetail, subscriptionList, updateSubscriptionStatus } from '../controllers/billingController.js';

const router = Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const staff = allowRoles('ADMIN', 'STAFF');

router.get('/dashboard', wrap(dashboard));
router.get('/subscriptions', wrap(subscriptionList));
router.post('/subscriptions', staff, wrap(createSubscription));
router.get('/subscriptions/:id', wrap(subscriptionDetail));
router.patch('/subscriptions/:id/status', staff, wrap(updateSubscriptionStatus));
router.post('/billing/run', staff, wrap(billingRun));
router.get('/invoices', wrap(listInvoices));
router.get('/invoices/:id', wrap(getInvoice));
router.post('/invoices/:id/payments', staff, wrap(addPayment));
router.get('/payments', wrap(listPayments));
router.get('/portal', allowRoles('CUSTOMER'), wrap(portal));

export default router;

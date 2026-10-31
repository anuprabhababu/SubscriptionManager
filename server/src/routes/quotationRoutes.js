import { Router } from 'express';
import { allowRoles } from '../middleware/roleMiddleware.js';
import {
  convertQuotation,
  createQuotation,
  createQuotationTemplate,
  deleteQuotationTemplate,
  getQuotation,
  listQuotationTemplates,
  listQuotations,
  updateQuotation,
  updateQuotationStatus,
  updateQuotationTemplate,
} from '../controllers/quotationController.js';

const router = Router();
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const staff = allowRoles('ADMIN', 'STAFF');
const admin = allowRoles('ADMIN');

router.get('/quotations', wrap(listQuotations));
router.post('/quotations', staff, wrap(createQuotation));
router.get('/quotations/:id', wrap(getQuotation));
router.put('/quotations/:id', staff, wrap(updateQuotation));
router.patch('/quotations/:id/status', staff, wrap(updateQuotationStatus));
router.post('/quotations/:id/convert', staff, wrap(convertQuotation));

router.get('/quotation-templates', staff, wrap(listQuotationTemplates));
router.post('/quotation-templates', admin, wrap(createQuotationTemplate));
router.put('/quotation-templates/:id', admin, wrap(updateQuotationTemplate));
router.delete('/quotation-templates/:id', admin, wrap(deleteQuotationTemplate));

export default router;

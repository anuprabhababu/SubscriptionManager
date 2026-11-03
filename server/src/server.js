import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authenticate } from './middleware/authMiddleware.js';
import { allowRoles } from './middleware/roleMiddleware.js';
import { register, login, createStaff, me } from './controllers/authController.js';
import { resource, variants } from './controllers/resourceController.js';
import billingRoutes from './routes/billingRoutes.js';
import quotationRoutes from './routes/quotationRoutes.js';
import financeRoutes from './routes/financeRoutes.js';
import { runRecurringBilling } from './services/billingService.js';
import { prisma } from './config/prisma.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('replace-with-') || process.env.JWT_SECRET.length < 32) {
  throw new Error('Set JWT_SECRET to a random secret with at least 32 characters before starting the API.');
}

const app = express();
const configuredOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',').map(origin => origin.trim()).filter(Boolean);
const localDevelopmentOrigin = /^https?:\/\/(localhost|127(?:\.\d{1,3}){3})(:\d+)?$/i;

app.use(cors({
  origin(origin, callback) {
    if (!origin || configuredOrigins.includes(origin) || localDevelopmentOrigin.test(origin)) return callback(null, true);
    const error = new Error('Origin is not allowed by CORS');
    error.status = 403;
    callback(error);
  },
}));
app.use(express.json({ limit: '1mb' }));

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.post('/api/auth/register', wrap(register));
app.post('/api/auth/login', wrap(login));

app.use('/api', authenticate);
app.use('/api', quotationRoutes);
app.use('/api', financeRoutes);
app.get('/api/auth/me', wrap(me));
app.post('/api/auth/staff', allowRoles('ADMIN'), wrap(createStaff));
app.use('/api', billingRoutes);

for (const name of ['customers', 'products', 'plans']) {
  const controller = resource(name);
  const router = express.Router();
  const staff = allowRoles('ADMIN', 'STAFF');
  router.get('/', wrap(controller.list));
  router.get('/:id', wrap(controller.get));
  router.post('/', staff, wrap(controller.create));
  router.put('/:id', staff, wrap(controller.update));
  router.delete('/:id', staff, wrap(controller.remove));
  app.use(`/api/${name}`, router);
}

app.get('/api/products/:productId/variants', wrap(variants));
app.post('/api/products/:productId/variants', allowRoles('ADMIN', 'STAFF'), wrap(variants));
app.put('/api/products/:productId/variants/:variantId', allowRoles('ADMIN', 'STAFF'), wrap(variants));
app.delete('/api/products/:productId/variants/:variantId', allowRoles('ADMIN', 'STAFF'), wrap(variants));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const code = err.code;
  let status = Number(err.status) || 500;
  let message = 'An unexpected server error occurred. Please try again.';
  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'The request body contains invalid JSON.';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'The request is too large.';
  } else if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(code)) {
    status = 503;
    message = 'The database is temporarily unavailable. Please retry in a moment.';
    res.set('Retry-After', '2');
  } else if (code === 'P2002') {
    status = 409;
    message = 'A record with these details already exists.';
  } else if (code === 'P2025') {
    status = 404;
    message = 'The requested record was not found.';
  } else if (code === 'P2003') {
    status = 409;
    message = 'This change conflicts with related records.';
  } else if (status === 400) {
    message = err.message || 'The request could not be completed.';
  } else if (status === 403) {
    message = 'This origin is not allowed to access the API.';
  }

  const safeDetail = String(err.message || '').replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database URL redacted]');
  console.error(JSON.stringify({ level: 'error', method: req.method, path: req.path, status, code: code || err.name || 'Error', detail: safeDetail }));
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT) || 4000;
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Subscriptly API listening on ${port}`);
});

let billingRunActive = false;
const runScheduledBilling = async () => {
  if (billingRunActive) return;
  billingRunActive = true;
  try {
    await runRecurringBilling();
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', task: 'recurring-billing', code: error.code || error.name || 'Error' }));
  } finally {
    billingRunActive = false;
  }
};

void runScheduledBilling();
const timer = setInterval(runScheduledBilling, 60_000);
timer.unref();

let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  server.close(() => prisma.$disconnect().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

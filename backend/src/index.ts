import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import { pool } from './db';
import customersRouter from './modules/customers/customers.routes';
import ordersRouter from './modules/orders/orders.routes';
import segmentsRouter from './modules/segments/segments.routes';
import campaignsRouter from './modules/campaigns/campaigns.routes';
import receiptsRouter from './modules/receipts/receipts.routes';
import aiRouter from './modules/ai/ai.routes';
import dashboardRouter from './modules/dashboard/dashboard.routes';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/segments', segmentsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/receipts', receiptsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/dashboard', dashboardRouter);

// ─── 404 for unmatched routes ─────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ─── Global error handler (must be last) ─────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[crm] backend running on http://localhost:${PORT}`);
});

export default app;

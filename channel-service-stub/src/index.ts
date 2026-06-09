import express from 'express';
import dotenv from 'dotenv';
import { simulateDelivery } from './simulator';
import type { SendRequest } from './types';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 3002);

app.use(express.json());

// ─── Stats counter (in-memory, resets on restart) ─────────────────────────────
const stats = {
  received: 0,
  inFlight: 0,
};

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ...stats, ts: new Date().toISOString() });
});

// ─── Send endpoint ────────────────────────────────────────────────────────────
//
// The CRM POSTs here once per recipient when launching a campaign.
//
// Contract:
//   Request:  SendRequest (messageId, recipientPhone, recipientEmail,
//                          message, channel, callbackUrl)
//   Response: 202 Accepted immediately.
//
// The actual delivery simulation runs asynchronously — the CRM should never
// block waiting for this response beyond the 202. Status updates arrive later
// via the callbackUrl.

app.post('/send', (req, res) => {
  const body = req.body as Partial<SendRequest>;

  if (!body.messageId || !body.callbackUrl || !body.message || !body.channel) {
    res.status(400).json({
      error: 'messageId, message, channel, and callbackUrl are required',
    });
    return;
  }

  const payload: SendRequest = {
    messageId: body.messageId,
    recipientPhone: body.recipientPhone ?? null,
    recipientEmail: body.recipientEmail ?? '',
    message: body.message,
    channel: body.channel,
    callbackUrl: body.callbackUrl,
  };

  // Respond 202 before simulation starts — the CRM is never blocked.
  res.status(202).json({ accepted: true, messageId: payload.messageId });

  stats.received += 1;
  stats.inFlight += 1;

  // Fire-and-forget: simulation runs fully async, firing callbacks over time.
  simulateDelivery(payload)
    .catch((err) =>
      console.error(`[stub] simulation error for ${payload.messageId}:`, err)
    )
    .finally(() => {
      stats.inFlight -= 1;
    });
});

app.listen(PORT, () => {
  console.log(`[channel-stub] running on http://localhost:${PORT}`);
  console.log(
    `[channel-stub] rates — failure: ${process.env.FAILURE_RATE ?? '0.10'} | open: ${process.env.OPEN_RATE ?? '0.50'} | click: ${process.env.CLICK_RATE ?? '0.35'}`
  );
});

export default app;

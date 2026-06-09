import { Router } from 'express';
import { validateBody } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/errorHandler';
import { ReceiptCallbackSchema } from './receipts.schema';
import { processReceipt } from './receipts.service';

const router = Router();

// POST /api/receipts/callback — called by the channel service stub.
//
// Always responds 200 OK regardless of whether the callback was "useful"
// (unknown messageId, duplicate, invalid transition). This prevents the channel
// service from retrying forever on stale or out-of-order events.
//
// The idempotency guarantee is enforced inside processReceipt() by:
//   1. Unique index on message_id (O(1) lookup)
//   2. Status-equality check before any write
//   3. Transition guard that rejects out-of-order states
router.post(
  '/callback',
  validateBody(ReceiptCallbackSchema),
  asyncHandler(async (req, res) => {
    const result = await processReceipt(req.body);
    // Surface the processing outcome for debugging but always 200.
    res.json({ ok: true, ...result });
  })
);

export default router;

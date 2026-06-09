import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { campaignDeliveries } from '../../db/schema';
import type { ReceiptCallbackPayload } from './receipts.schema';

// ─── Status transition table ──────────────────────────────────────────────────
//
// Only the listed transitions are valid. Any other (delivered → sent, failed →
// delivered, etc.) is either a duplicate, out-of-order, or a bug in the channel
// service. We acknowledge silently so the channel service doesn't retry forever.

const VALID_NEXT: Partial<Record<string, string[]>> = {
  queued: ['sent'],
  sent: ['delivered', 'failed'],
  delivered: ['opened', 'failed'],
  opened: ['clicked', 'failed'],
  // 'clicked' and 'failed' are terminal — no valid next states.
};

// ─── Core idempotent receipt handler ─────────────────────────────────────────

export async function processReceipt(payload: ReceiptCallbackPayload): Promise<{
  processed: boolean;
  reason?: string;
}> {
  const { messageId, status, timestamp, failureReason } = payload;

  // O(1) lookup via unique index on message_id.
  const [delivery] = await db
    .select({
      id: campaignDeliveries.id,
      status: campaignDeliveries.status,
    })
    .from(campaignDeliveries)
    .where(eq(campaignDeliveries.messageId, messageId))
    .limit(1);

  // Unknown messageId: stale callback or spurious traffic. Acknowledge with 200
  // so the channel service doesn't retry (retries won't help either).
  if (!delivery) {
    return { processed: false, reason: 'unknown_message_id' };
  }

  // Idempotency: same status already recorded → no-op.
  if (delivery.status === status) {
    return { processed: false, reason: 'already_processed' };
  }

  // Transition guard: reject invalid / out-of-order events.
  const allowed = VALID_NEXT[delivery.status] ?? [];
  if (!allowed.includes(status)) {
    return {
      processed: false,
      reason: 'invalid_transition',
    };
  }

  // Build the minimal update payload. Only the relevant timestamp field is set
  // to preserve previously recorded timestamps from earlier lifecycle events.
  const ts = new Date(timestamp);
  type DeliveryUpdate = Partial<typeof campaignDeliveries.$inferInsert>;

  const updates: DeliveryUpdate = { status: status as DeliveryUpdate['status'] };

  switch (status) {
    case 'sent':
      updates.sentAt = ts;
      break;
    case 'delivered':
      updates.deliveredAt = ts;
      break;
    case 'opened':
      updates.openedAt = ts;
      break;
    case 'clicked':
      updates.clickedAt = ts;
      break;
    case 'failed':
      updates.failedAt = ts;
      updates.failureReason = failureReason ?? 'unknown';
      break;
  }

  await db
    .update(campaignDeliveries)
    .set(updates)
    .where(eq(campaignDeliveries.messageId, messageId));

  return { processed: true };
}

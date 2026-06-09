import { eq } from 'drizzle-orm';
import { db } from '../db';
import { campaigns } from '../db/schema';
import { chunkArray } from './utils';

// Contact info is resolved by the campaigns service at launch time (from the
// segment query result) and passed here so the dispatcher doesn't need a
// second DB round-trip.
export interface DispatchEntry {
  messageId: string;
  recipientPhone: string | null;
  recipientEmail: string;
  personalizedMessage: string;
  channel: 'whatsapp' | 'sms' | 'email' | 'rcs';
}

const channelUrl = () =>
  process.env.CHANNEL_SERVICE_URL ?? 'http://localhost:3002';

const callbackUrl = () =>
  process.env.CRM_RECEIPT_CALLBACK_URL ?? 'http://localhost:3001/api/receipts/callback';

// ─── Fan-out dispatcher ───────────────────────────────────────────────────────
//
// Called via setImmediate (non-blocking) from campaigns.service.launchCampaign.
// The HTTP response to the client is sent before this function runs.
//
// Scale note: for production, replace the setImmediate pattern with a
// persistent BullMQ job so the work survives a server restart and can be
// picked up by any worker replica.

export async function dispatchCampaign(
  campaignId: string,
  entries: DispatchEntry[]
): Promise<void> {
  const cb = callbackUrl();
  const base = channelUrl();

  // Dispatch in chunks of 50 concurrent requests to the channel service.
  // Promise.allSettled means a single-message failure never aborts the batch.
  for (const chunk of chunkArray(entries, 50)) {
    await Promise.allSettled(
      chunk.map((entry) =>
        fetch(`${base}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: entry.messageId,
            recipientPhone: entry.recipientPhone,
            recipientEmail: entry.recipientEmail,
            message: entry.personalizedMessage,
            channel: entry.channel,
            callbackUrl: cb,
          }),
        }).then((res) => {
          if (!res.ok) {
            console.warn(
              `[dispatcher] channel service rejected ${entry.messageId}: HTTP ${res.status}`
            );
          }
        })
      )
    );
  }

  // Mark campaign completed after all send requests are accepted.
  await db
    .update(campaigns)
    .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  console.log(
    `[dispatcher] campaign ${campaignId} — dispatched ${entries.length} messages`
  );
}

import type { SendRequest, StatusCallback } from './types';

// ─── Configurable probability model ──────────────────────────────────────────
//
// All rates are overridable via env vars so you can dial the demo to show
// different funnel shapes without redeploying.

const FAILURE_RATE = parseFloat(process.env.FAILURE_RATE ?? '0.10'); // 10% fail
const OPEN_RATE = parseFloat(process.env.OPEN_RATE ?? '0.50');       // 50% open
const CLICK_RATE = parseFloat(process.env.CLICK_RATE ?? '0.35');     // 35% click

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const FAILURE_REASONS = [
  'number_unreachable',
  'not_on_whatsapp',
  'message_rejected_by_carrier',
  'recipient_opted_out',
  'network_timeout',
];

function pickFailureReason(): string {
  return FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)];
}

// ─── Callback poster ──────────────────────────────────────────────────────────

async function postCallback(
  callbackUrl: string,
  payload: StatusCallback
): Promise<void> {
  try {
    const res = await fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(
        `[stub] callback ${payload.status} for ${payload.messageId} got HTTP ${res.status}`
      );
    }
  } catch (err) {
    console.error(
      `[stub] callback ${payload.status} for ${payload.messageId} failed:`,
      err
    );
  }
}

function cb(messageId: string, callbackUrl: string) {
  return (status: StatusCallback['status'], extra?: Pick<StatusCallback, 'failureReason'>) =>
    postCallback(callbackUrl, {
      messageId,
      status,
      timestamp: new Date().toISOString(),
      ...extra,
    });
}

// ─── Core simulation ──────────────────────────────────────────────────────────
//
// Each message goes through a probabilistic lifecycle:
//
//   SENT → DELIVERED (90%) → OPENED (50%) → CLICKED (35%)
//       ↘                  ↘              ↘
//        FAILED (10%)       FAILED (rare)  (stops here)
//
// Each stage fires a real HTTP callback to the CRM receipt endpoint. Callbacks
// are sequential (each awaited) so the CRM always receives them in order and
// our transition guard never sees out-of-order events from this stub.
//
// In a real multi-worker scenario, the CRM should still handle out-of-order
// delivery gracefully (see README notes on production hardening).

export async function simulateDelivery(req: SendRequest): Promise<void> {
  const post = cb(req.messageId, req.callbackUrl);

  // Stage 1: always fires 'sent' after a short network-latency simulation
  await sleep(randBetween(200, 800));
  await post('sent');

  // Stage 2: failure branch (FAILURE_RATE of all messages)
  if (Math.random() < FAILURE_RATE) {
    await sleep(randBetween(500, 1500));
    await post('failed', { failureReason: pickFailureReason() });
    return;
  }

  // Stage 3: delivered
  await sleep(randBetween(800, 2500));
  await post('delivered');

  // Stage 4: opened (OPEN_RATE of delivered)
  if (Math.random() > OPEN_RATE) return;
  await sleep(randBetween(1500, 4000));
  await post('opened');

  // Stage 5: clicked (CLICK_RATE of opened)
  if (Math.random() > CLICK_RATE) return;
  await sleep(randBetween(1000, 3000));
  await post('clicked');
}

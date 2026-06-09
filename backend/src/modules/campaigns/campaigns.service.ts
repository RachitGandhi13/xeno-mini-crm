import { randomUUID } from 'crypto';
import { sql, eq, and, desc, count } from 'drizzle-orm';
import { db, pool } from '../../db';
import {
  campaigns,
  campaignDeliveries,
  segmentDefinitions,
} from '../../db/schema';
import type { SegmentRule, Campaign } from '../../db/schema';
import { compileSegmentQuery } from '../../lib/segmentCompiler';
import { chunkArray, interpolateTemplate } from '../../lib/utils';
import { dispatchCampaign, type DispatchEntry } from '../../lib/campaignDispatcher';
import { AppError, notFound } from '../../middleware/errorHandler';
import type { CreateCampaignInput } from './campaigns.schema';

// ─── Row type returned by the segment query ───────────────────────────────────
interface AudienceRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  city: string | null;
}

// ─── Create campaign (draft state) ────────────────────────────────────────────

export async function createCampaign(input: CreateCampaignInput) {
  let rulesSnapshot: SegmentRule[];

  if (input.segmentDefinitionId) {
    const [segDef] = await db
      .select()
      .from(segmentDefinitions)
      .where(eq(segmentDefinitions.id, input.segmentDefinitionId))
      .limit(1);

    if (!segDef) throw notFound('Segment definition');
    rulesSnapshot = segDef.rules as SegmentRule[];
  } else {
    // segmentRules is guaranteed non-null by the Zod refine check.
    rulesSnapshot = input.segmentRules as SegmentRule[];
  }

  const [campaign] = await db
    .insert(campaigns)
    .values({
      name: input.name,
      channel: input.channel,
      messageTemplate: input.messageTemplate,
      segmentDefinitionId: input.segmentDefinitionId ?? null,
      segmentRulesSnapshot: rulesSnapshot,
      status: 'draft',
    })
    .returning();

  return campaign;
}

// ─── Launch campaign ─────────────────────────────────────────────────────────
//
// Design:
//   1. Compile + run segment query (read-only, pool.query)
//   2. Atomic Compare-And-Swap: UPDATE … WHERE status = 'draft'
//      If 0 rows returned, the campaign is already running/completed — 409.
//   3. Batch INSERT campaign_deliveries (chunks of 500)
//   4. Fire-and-forget async dispatch via setImmediate
//   5. Return immediately with the running campaign — client polls for 'completed'

export async function launchCampaign(campaignId: string): Promise<Campaign & { audienceCount: number }> {
  // Step 1: load campaign
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) throw notFound('Campaign');

  if (!campaign.segmentRulesSnapshot || campaign.segmentRulesSnapshot.length === 0) {
    throw new AppError(400, 'Campaign has no segment rules snapshot', 'NO_RULES');
  }

  // Step 2: resolve audience
  const compiled = compileSegmentQuery(campaign.segmentRulesSnapshot as SegmentRule[]);
  const { rows: audience } = await pool.query<AudienceRow>(
    compiled.sql,
    compiled.params
  );

  if (audience.length === 0) {
    throw new AppError(422, 'Segment matches 0 customers — refine the rules', 'EMPTY_AUDIENCE');
  }

  // Step 3: atomic status transition (CAS prevents double-launch)
  const [locked] = await db
    .update(campaigns)
    .set({
      status: 'running',
      startedAt: new Date(),
      totalAudienceCount: audience.length,
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, 'draft')))
    .returning();

  if (!locked) {
    throw new AppError(409, 'Campaign has already been launched or is not in draft state');
  }

  // Step 4: build delivery rows + dispatch entries
  const deliveryRows: typeof campaignDeliveries.$inferInsert[] = [];
  const dispatchEntries: DispatchEntry[] = [];

  for (const customer of audience) {
    const messageId = randomUUID();
    const personalizedMessage = interpolateTemplate(campaign.messageTemplate, customer);

    deliveryRows.push({
      messageId,
      campaignId,
      customerId: customer.id,
      personalizedMessage,
      channel: campaign.channel,
      status: 'queued',
    });

    dispatchEntries.push({
      messageId,
      recipientPhone: customer.phone,
      recipientEmail: customer.email,
      personalizedMessage,
      channel: campaign.channel,
    });
  }

  // Step 5: batch INSERT in chunks of 500 (stays under pg's parameter limit)
  for (const chunk of chunkArray(deliveryRows, 500)) {
    await db.insert(campaignDeliveries).values(chunk);
  }

  // Step 6: kick off async dispatch — response returns before this runs
  setImmediate(() => {
    dispatchCampaign(campaignId, dispatchEntries).catch((err) => {
      console.error(`[campaigns] dispatch failed for ${campaignId}:`, err);
      // Best-effort status rollback — non-critical if this also fails
      db.update(campaigns)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(campaigns.id, campaignId))
        .catch(console.error);
    });
  });

  return { ...locked, audienceCount: audience.length };
}

// ─── Campaign analytics ───────────────────────────────────────────────────────

export async function getCampaignAnalytics(campaignId: string) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) throw notFound('Campaign');

  // Single aggregation query for the delivery funnel.
  // FILTER (WHERE …) is a PostgreSQL extension that avoids multiple passes.
  const { rows: funnelRows } = await pool.query<{
    total: string;
    queued: string;
    sent: string;
    delivered: string;
    opened: string;
    clicked: string;
    failed: string;
  }>(
    `SELECT
       COUNT(*)                                         AS total,
       COUNT(*) FILTER (WHERE status = 'queued')       AS queued,
       COUNT(*) FILTER (WHERE status = 'sent')         AS sent,
       COUNT(*) FILTER (WHERE status = 'delivered')    AS delivered,
       COUNT(*) FILTER (WHERE status = 'opened')       AS opened,
       COUNT(*) FILTER (WHERE status = 'clicked')      AS clicked,
       COUNT(*) FILTER (WHERE status = 'failed')       AS failed
     FROM campaign_deliveries
     WHERE campaign_id = $1`,
    [campaignId]
  );

  // Conversion + revenue from attributed orders.
  const { rows: convRows } = await pool.query<{
    conversions: string;
    revenue: string;
  }>(
    `SELECT
       COUNT(*)                              AS conversions,
       COALESCE(SUM(total_amount::numeric), 0) AS revenue
     FROM orders
     WHERE attributed_campaign_id = $1`,
    [campaignId]
  );

  const f = funnelRows[0];
  const toInt = (v: string) => parseInt(v, 10) || 0;
  const toFloat = (v: string) => parseFloat(v) || 0;

  const total = toInt(f.total);
  const delivered = toInt(f.delivered);
  const opened = toInt(f.opened);
  const clicked = toInt(f.clicked);
  const failed = toInt(f.failed);
  const engaged = total - toInt(f.queued); // messages that left 'queued'

  return {
    campaign,
    funnel: {
      total,
      queued: toInt(f.queued),
      sent: toInt(f.sent),
      delivered,
      opened,
      clicked,
      failed,
    },
    rates: {
      deliveryRate: engaged > 0 ? +(delivered / engaged).toFixed(4) : 0,
      openRate: delivered > 0 ? +(opened / delivered).toFixed(4) : 0,
      clickRate: opened > 0 ? +(clicked / opened).toFixed(4) : 0,
      failureRate: engaged > 0 ? +(failed / engaged).toFixed(4) : 0,
    },
    conversions: {
      count: toInt(convRows[0].conversions),
      revenue: toFloat(convRows[0].revenue),
    },
  };
}

// ─── List campaigns ───────────────────────────────────────────────────────────

export async function listCampaigns(opts: {
  page: number;
  limit: number;
  status?: Campaign['status'];
}) {
  const { page, limit, status } = opts;
  const offset = (page - 1) * limit;

  const where = status ? eq(campaigns.status, status) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(campaigns)
      .where(where)
      .orderBy(desc(campaigns.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(campaigns).where(where),
  ]);

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Get single campaign ──────────────────────────────────────────────────────

export async function getCampaignById(id: string) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);

  if (!campaign) throw notFound('Campaign');
  return campaign;
}

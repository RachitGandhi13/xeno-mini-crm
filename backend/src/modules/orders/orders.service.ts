import { sql, eq, desc, count } from 'drizzle-orm';
import { db } from '../../db';
import { orders, customers, campaignDeliveries } from '../../db/schema';
import { notFound } from '../../middleware/errorHandler';
import type { CreateOrderInput } from './orders.schema';

// ─── Create order + run 7-day last-touch attribution ─────────────────────────

export async function createOrder(input: CreateOrderInput) {
  return db.transaction(async (tx) => {
    // Verify customer exists before inserting — gives a clear 404 rather than
    // a foreign-key violation message.
    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .limit(1);

    if (!customer) throw notFound('Customer');

    // Insert the order. totalAmount is stored as NUMERIC so we stringify it.
    const [newOrder] = await tx
      .insert(orders)
      .values({
        customerId: input.customerId,
        totalAmount: input.totalAmount.toFixed(2),
        items: input.items ?? null,
      })
      .returning();

    // Attribution check: last campaign interaction within 7 days.
    //
    // Priority: clicked > delivered.  COALESCE picks the most relevant
    // timestamp. We take the single most recent matching delivery so there's
    // a deterministic winner even if the customer received multiple campaigns.
    const attribution = await tx.execute<{ campaign_id: string }>(sql`
      SELECT campaign_id
      FROM campaign_deliveries
      WHERE customer_id = ${input.customerId}::uuid
        AND (
          (status = 'clicked'   AND clicked_at   >= NOW() - INTERVAL '7 days')
          OR
          (status = 'delivered' AND delivered_at  >= NOW() - INTERVAL '7 days')
        )
      ORDER BY COALESCE(clicked_at, delivered_at) DESC NULLS LAST
      LIMIT 1
    `);

    if (attribution.rows.length === 0) return newOrder;

    // Attribute the order to the winning campaign.
    const [attributed] = await tx
      .update(orders)
      .set({ attributedCampaignId: attribution.rows[0].campaign_id })
      .where(eq(orders.id, newOrder.id))
      .returning();

    return attributed;
  });
}

// ─── List orders for a specific customer ─────────────────────────────────────

export async function listOrdersByCustomer(
  customerId: string,
  opts: { page: number; limit: number }
) {
  const { page, limit } = opts;
  const offset = (page - 1) * limit;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(eq(orders.customerId, customerId))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(orders)
      .where(eq(orders.customerId, customerId)),
  ]);

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Get single order ─────────────────────────────────────────────────────────

export async function getOrderById(id: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, id))
    .limit(1);

  if (!order) throw notFound('Order');
  return order;
}

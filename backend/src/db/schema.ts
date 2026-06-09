import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Shared JSON column types ─────────────────────────────────────────────────
//
// These types define the shape of data stored in JSONB columns. Drizzle's
// .$type<T>() call does NOT add a runtime check — validation happens at the
// application layer (segmentCompiler.ts, dataIngestion.ts, Zod schemas).

export type SegmentRuleField =
  | 'total_spend'        // HAVING  — SUM(orders.total_amount)
  | 'order_count'        // HAVING  — COUNT(orders.id)
  | 'last_purchase_days' // HAVING  — days since MAX(orders.created_at)
  | 'city'               // WHERE   — customers.city
  | 'tag';               // WHERE   — value = ANY(customers.tags)

export type SegmentOperator =
  | 'gte' | 'lte' | 'gt' | 'lt' | 'eq' | 'neq' | 'contains';

export interface SegmentRule {
  field: SegmentRuleField;
  operator: SegmentOperator;
  value: string | number;
}

export interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

// ─── Enums ────────────────────────────────────────────────────────────────────

export const channelEnum = pgEnum('channel', ['whatsapp', 'sms', 'email', 'rcs']);

export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'running',
  'completed',
  'failed',
]);

// Status lifecycle: queued → sent → delivered → (opened | failed) → clicked
export const deliveryStatusEnum = pgEnum('delivery_status', [
  'queued',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'failed',
]);

// ─── Tables (defined in dependency order to avoid forward references) ─────────

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    // Stored in E.164 format (+91XXXXXXXXXX). Validated and normalised at ingestion.
    phone: text('phone'),
    city: text('city'),
    // Freeform demographic tags, e.g. ["vip", "loyalty-tier-gold"]
    tags: text('tags').array().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Primary segmentation key — also enforces dedup on ingestion.
    uniqueIndex('customers_email_idx').on(table.email),
    // Supports demographic filters without a full-table scan.
    index('customers_city_idx').on(table.city),
  ]
);

export const segmentDefinitions = pgTable('segment_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  // Persisted JSON rule array — compiled to SQL at query time by segmentCompiler.ts.
  rules: jsonb('rules').notNull().$type<SegmentRule[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Defined before orders so orders can reference it without forward-reference tricks.
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    channel: channelEnum('channel').notNull(),
    status: campaignStatusEnum('status').notNull().default('draft'),
    // Optional link to a saved segment. Can be null if segment was ad-hoc.
    segmentDefinitionId: uuid('segment_definition_id').references(
      () => segmentDefinitions.id,
      { onDelete: 'set null' }
    ),
    // Snapshot of the rules used when the campaign was launched. Preserved for
    // auditability even if the source segment_definition is later edited/deleted.
    segmentRulesSnapshot: jsonb('segment_rules_snapshot').$type<SegmentRule[]>(),
    // Supports {{name}} and {{city}} placeholders — personalised at dispatch time.
    messageTemplate: text('message_template').notNull(),
    totalAudienceCount: integer('total_audience_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    // Allows efficient filtering of active/draft campaigns on the dashboard.
    index('campaigns_status_idx').on(table.status),
    index('campaigns_segment_definition_id_idx').on(table.segmentDefinitionId),
  ]
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    // NUMERIC(12,2) stores exact decimal values. The pg driver returns this as a
    // string — cast to ::numeric in SQL or parseFloat() at the service layer.
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    // Flexible line-item storage. Schema: OrderItem[].
    items: jsonb('items').$type<OrderItem[]>(),
    // Conversion attribution: set when a customer places an order within 7 days
    // of clicking/reading a campaign message. Written by the attribution service,
    // NOT by the channel stub callback.
    attributedCampaignId: uuid('attributed_campaign_id').references(
      () => campaigns.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // The two most common query patterns: orders per customer, and orders in a
    // date range (for RFM recency filters).
    index('orders_customer_id_idx').on(table.customerId),
    index('orders_created_at_idx').on(table.createdAt),
    index('orders_attributed_campaign_id_idx').on(table.attributedCampaignId),
  ]
);

export const campaignDeliveries = pgTable(
  'campaign_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Opaque ID generated at dispatch time and sent to the channel service.
    // The channel service echoes it back in every status callback, giving us
    // an O(1) lookup for the receipt endpoint and a natural idempotency key.
    messageId: text('message_id').notNull(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    personalizedMessage: text('personalized_message').notNull(),
    channel: channelEnum('channel').notNull(),
    status: deliveryStatusEnum('status').notNull().default('queued'),
    failureReason: text('failure_reason'),
    // Nullable timestamps — set exactly once when each event arrives.
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    clickedAt: timestamp('clicked_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Primary idempotency guard — duplicate receipt webhooks hit a unique
    // violation before touching any campaign analytics.
    uniqueIndex('campaign_deliveries_message_id_idx').on(table.messageId),
    // Business constraint: one message per customer per campaign.
    // Also used by campaign analytics aggregations.
    uniqueIndex('campaign_deliveries_campaign_customer_idx').on(
      table.campaignId,
      table.customerId
    ),
    index('campaign_deliveries_campaign_id_idx').on(table.campaignId),
    index('campaign_deliveries_customer_id_idx').on(table.customerId),
    // Allows the analytics layer to count each status bucket with an index scan.
    index('campaign_deliveries_status_idx').on(table.status),
  ]
);

// ─── Relations (used by Drizzle's relational query API) ───────────────────────

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
  campaignDeliveries: many(campaignDeliveries),
}));

export const segmentDefinitionsRelations = relations(segmentDefinitions, ({ many }) => ({
  campaigns: many(campaigns),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  segmentDefinition: one(segmentDefinitions, {
    fields: [campaigns.segmentDefinitionId],
    references: [segmentDefinitions.id],
  }),
  deliveries: many(campaignDeliveries),
  attributedOrders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  attributedCampaign: one(campaigns, {
    fields: [orders.attributedCampaignId],
    references: [campaigns.id],
  }),
}));

export const campaignDeliveriesRelations = relations(campaignDeliveries, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignDeliveries.campaignId],
    references: [campaigns.id],
  }),
  customer: one(customers, {
    fields: [campaignDeliveries.customerId],
    references: [customers.id],
  }),
}));

// ─── Inferred TypeScript types ────────────────────────────────────────────────

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;

export type CampaignDelivery = typeof campaignDeliveries.$inferSelect;
export type NewCampaignDelivery = typeof campaignDeliveries.$inferInsert;

export type SegmentDefinition = typeof segmentDefinitions.$inferSelect;
export type NewSegmentDefinition = typeof segmentDefinitions.$inferInsert;

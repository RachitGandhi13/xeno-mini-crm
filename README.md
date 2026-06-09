# Xeno Mini CRM

An AI-native Mini CRM for helping direct-to-consumer brands reach their shoppers through intelligent, data-driven campaigns.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Tech Stack](#tech-stack)
3. [Data Model](#data-model)
4. [Index Strategy](#index-strategy)
5. [Segment Rule Engine](#segment-rule-engine)
6. [Async Delivery Loop](#async-delivery-loop)
7. [Conversion Attribution](#conversion-attribution)
8. [Data Ingestion Quality](#data-ingestion-quality)
9. [API Contracts](#api-contracts)
10. [Running Locally](#running-locally)
11. [Scale Assumptions & Production Gaps](#scale-assumptions--production-gaps)

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          BROWSER / CLIENT                        │
└─────────────────────────┬────────────────────────────────────────┘
                          │  REST
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                     /backend  (Node.js + Express)                │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────┐  │
│  │customers │  │segments  │  │ campaigns │  │   receipts    │  │
│  │  /orders │  │  /rules  │  │ /dispatch │  │  /callback    │  │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └──────┬────────┘  │
│       │             │              │                │            │
│       └─────────────┴──────────────┴────────────────┘           │
│                              │                                   │
│                        Drizzle ORM                               │
│                              │                                   │
│                         pg Pool (max:10)                         │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
                   ┌───────────────────────┐
                   │  PostgreSQL (Neon /   │
                   │  Supabase)            │
                   └───────────────────────┘
                               ▲
          async POST /callback  │
                               │
┌──────────────────────────────┴───────────────────────────────────┐
│              /channel-service-stub  (Node.js)                    │
│                                                                  │
│  Receives send requests → simulates network delay → fires        │
│  status callbacks (sent, delivered, opened, clicked, failed)     │
│  back to CRM receipt endpoint                                    │
└──────────────────────────────────────────────────────────────────┘
```

The three services are independently deployable. In development they run on separate ports (3001, 3002). In production each is a separate Railway/Render service.

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 20 LTS | Stable, broad ecosystem, well-supported on Railway/Render |
| Language | TypeScript (strict) | End-to-end type safety from DB schema → API response |
| Framework | Express 4 | Minimal surface area; no magic, easy to reason about |
| ORM | Drizzle ORM | Schema-as-code, SQL-first, excellent TypeScript inference |
| Database | PostgreSQL (Neon) | ACID guarantees, powerful aggregation for RFM queries, free tier |
| Validation | Zod | Runtime schema validation for all API inputs |
| AI | Vercel AI SDK + GPT-4o-mini | Structured output (`generateObject`) for NL → segment rules |
| Frontend | React + Tailwind + shadcn/ui | Fast to compose, accessible components |
| Deployment | Railway (backend, channel stub) + Neon (DB) | Git-push deploys, free tier sufficient |

---

## Data Model

### Entity Relationship Overview

```
customers
  ├── orders (customer_id FK)          many orders per customer
  │     └── attributed_campaign_id FK  nullable conversion attribution
  ├── campaign_deliveries              one delivery row per campaign per customer
  │     └── campaign_id FK
  │
segments (segment_definitions)
  └── campaigns                        one saved segment can power many campaigns
        └── campaign_deliveries        one delivery row per recipient
```

### Table Definitions

#### `customers`
Core shopper profile. Email is the deduplication key.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | text UNIQUE NOT NULL | Lowercased at ingestion |
| name | text NOT NULL | Title-cased at ingestion |
| phone | text | E.164 format (+91XXXXXXXXXX) |
| city | text | Trimmed |
| tags | text[] | Lowercase tags e.g. `["vip", "loyalty-gold"]` |
| created_at / updated_at | timestamptz | |

#### `segment_definitions`
Reusable, named rule sets. Campaigns take a snapshot at launch.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | |
| description | text | |
| rules | jsonb NOT NULL | `SegmentRule[]` — compiled to SQL by `segmentCompiler.ts` |

#### `campaigns`
A campaign ties a message template to a channel and an audience.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text | |
| channel | enum | whatsapp / sms / email / rcs |
| status | enum | draft → running → completed / failed |
| segment_definition_id | uuid FK | Nullable — can be ad-hoc |
| segment_rules_snapshot | jsonb | Immutable copy of rules at launch time |
| message_template | text | Supports `{{name}}` and `{{city}}` placeholders |
| total_audience_count | int | Set at campaign launch |
| started_at / completed_at | timestamptz | |

#### `orders`
Purchase records. The `attributed_campaign_id` column implements conversion tracking.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| customer_id | uuid FK → customers | CASCADE delete |
| total_amount | numeric(12,2) | pg returns this as string — cast when aggregating |
| items | jsonb | `OrderItem[]` — flexible line-item storage |
| attributed_campaign_id | uuid FK → campaigns | Nullable. Set by attribution service, not channel stub |
| created_at | timestamptz | Indexed for RFM recency queries |

#### `campaign_deliveries`
One row per recipient per campaign. The `message_id` is the idempotency key for the receipt endpoint.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| message_id | text UNIQUE | Generated at dispatch; echoed by channel stub in callbacks |
| campaign_id | uuid FK → campaigns | |
| customer_id | uuid FK → customers | |
| personalized_message | text | Template resolved at dispatch time |
| channel | enum | |
| status | enum | queued → sent → delivered → opened / failed → clicked |
| failure_reason | text | Populated on failed callbacks |
| sent_at / delivered_at / opened_at / clicked_at / failed_at | timestamptz | Set exactly once per event |

---

## Index Strategy

Every index has a specific query it's designed to accelerate:

| Index | Table | Type | Serves |
|---|---|---|---|
| `customers_email_idx` | customers | UNIQUE | Deduplication on ingestion; login lookup |
| `customers_city_idx` | customers | BTREE | Demographic segment filters `WHERE city = $1` |
| `campaigns_status_idx` | campaigns | BTREE | Dashboard query: active/draft campaigns |
| `orders_customer_id_idx` | orders | BTREE | RFM aggregation JOIN: `orders.customer_id = customers.id` |
| `orders_created_at_idx` | orders | BTREE | Recency filter: `WHERE created_at > NOW() - INTERVAL '30 days'` |
| `orders_attributed_campaign_id_idx` | orders | BTREE | Conversion report: `WHERE attributed_campaign_id = $1` |
| `campaign_deliveries_message_id_idx` | campaign_deliveries | UNIQUE | O(1) idempotency check on receipt callback |
| `campaign_deliveries_campaign_customer_idx` | campaign_deliveries | UNIQUE (composite) | Prevents double-send; also used in analytics GROUP BY |
| `campaign_deliveries_status_idx` | campaign_deliveries | BTREE | Analytics: `COUNT(*) WHERE status = 'delivered'` |

**Why not index `customers.tags`?**  
Array containment queries (`$val = ANY(tags)`) are not efficiently served by a standard BTREE index. A GIN index (`CREATE INDEX … USING GIN (tags)`) would help at scale, deferred from this scope.

---

## Segment Rule Engine

The `segmentCompiler.ts` module converts a JSON rule array into a parameterised PostgreSQL query with no in-memory filtering.

### Rule schema

```typescript
interface SegmentRule {
  field: 'total_spend' | 'order_count' | 'last_purchase_days' | 'city' | 'tag';
  operator: 'gte' | 'lte' | 'gt' | 'lt' | 'eq' | 'neq' | 'contains';
  value: string | number;
}
```

### Compilation logic

Rules are classified as **WHERE** (non-aggregate) or **HAVING** (aggregate):

- `city`, `tag` → plain `WHERE` predicates against `customers` columns
- `total_spend`, `order_count`, `last_purchase_days` → aggregate expressions in `HAVING`

**Fast path (no aggregate rules):** Skips the JOIN and GROUP BY entirely.

```sql
SELECT id, email, name, phone, city
FROM customers c
WHERE c.city = $1
```

**Full RFM path:**

```sql
SELECT c.id, c.email, c.name, c.phone, c.city
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE c.city = $1
GROUP BY c.id, c.email, c.name, c.phone, c.city
HAVING COALESCE(SUM(o.total_amount::numeric), 0) >= $2
  AND COUNT(o.id) >= $3
  AND EXTRACT(EPOCH FROM (NOW() - MAX(o.created_at))) / 86400.0 <= $4
```

**Notable choices:**
- `LEFT JOIN` (not `INNER JOIN`) so customers with zero orders still appear and fail aggregate conditions explicitly rather than being silently excluded.
- `COALESCE(SUM(...), 0)` so a `total_spend gte 0` rule correctly includes customers with no orders.
- All user-supplied values are passed as `$N` parameters — zero risk of SQL injection.

### AI-powered rule generation

In Phase 3, the natural language input `"customers who spent over ₹5000 in the last month"` is sent to GPT-4o-mini via `generateObject`, which returns:

```json
[
  { "field": "total_spend", "operator": "gte", "value": 5000 },
  { "field": "last_purchase_days", "operator": "lte", "value": 30 }
]
```

This JSON passes through `validateSegmentRules()` and directly into `compileSegmentQuery()`.

---

## Async Delivery Loop

```
CRM backend                          Channel Service Stub
──────────────                       ────────────────────
POST /api/channel/send  ──────────►  Receives message
  { messageId, recipient,            Simulates delay (1–5s)
    message, channel }               
                                     Fires webhook:
◄──────────────────────  POST /api/receipts/callback
                           { messageId, status: "sent" }
                           { messageId, status: "delivered" }
                           { messageId, status: "clicked" }  (probabilistic)
```

### Idempotency on the receipt endpoint

1. Callback arrives with `{ messageId, status }`.
2. `UPDATE campaign_deliveries SET status = $2, <status>_at = NOW() WHERE message_id = $1 AND status != $2`  
   The `AND status != $2` guard means replayed callbacks with the same status are no-ops.
3. The `UNIQUE` index on `message_id` means a lookup is always O(1).
4. Status transitions are enforced at the application layer — a `DELIVERED` event cannot downgrade a `CLICKED` record.

### Concurrency

If `DELIVERED` and `CLICKED` arrive simultaneously for the same `message_id`, both hit the same DB row. PostgreSQL's row-level locking ensures only one UPDATE executes at a time; the second Update targets the post-first-update state and applies cleanly (since `CLICKED` is a later state than `DELIVERED`).

---

## Conversion Attribution

When a customer places a new order, the orders service runs a lightweight attribution check:

```sql
SELECT cd.campaign_id
FROM campaign_deliveries cd
WHERE cd.customer_id = $1
  AND cd.status IN ('clicked', 'delivered')
  AND cd.clicked_at >= NOW() - INTERVAL '7 days'
ORDER BY cd.clicked_at DESC
LIMIT 1
```

If a row is found, `orders.attributed_campaign_id` is set to that campaign's ID. This is a last-touch, 7-day click-through attribution window — a standard baseline in CRM analytics.

This design keeps conversion tracking inside the CRM's relational model rather than as a synthetic channel status, which more accurately reflects real-world brands where purchases happen on the brand's own platform.

---

## Data Ingestion Quality

`dataIngestion.ts` normalises raw inputs before any DB write:

| Field | Transformation |
|---|---|
| email | `trim()` + `toLowerCase()` + format validation |
| name | `trim()` + Title Case |
| phone | Strip formatting chars → E.164 coercion for 10-digit Indian numbers → null if unrecognised |
| city | `trim()` |
| tags | Filter non-strings → `trim()` + `toLowerCase()` per tag |

Batch ingestion deduplicates within the batch by email before the DB call. DB-level deduplication is handled by `INSERT … ON CONFLICT (email) DO UPDATE` (upsert pattern, implemented in Phase 2).

---

## API Contracts

### Customers

| Method | Path | Body / Query | Description |
|---|---|---|---|
| `POST` | `/api/customers` | `{ email, name, phone?, city?, tags? }` | Create or upsert a single customer |
| `POST` | `/api/customers/bulk` | `{ customers: RawCustomer[] }` (max 1000) | Bulk ingest — returns `{ inserted, failed, errors }` |
| `GET` | `/api/customers` | `?page&limit&city&search` | Paginated list with optional filters |
| `GET` | `/api/customers/:id` | — | Single customer by UUID |

### Orders

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/api/orders` | `{ customerId, totalAmount, items? }` | Create order; attribution check runs automatically inside a transaction |
| `GET` | `/api/orders/:id` | — | Single order |
| `GET` | `/api/orders/customer/:customerId` | `?page&limit` | All orders for a customer |

### Segments

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/api/segments/preview` | `{ rules: SegmentRule[] }` | Dry-run: returns `{ count, sample[10], compiledSql }` without saving |
| `POST` | `/api/segments` | `{ name, description?, rules }` | Save a named segment |
| `GET` | `/api/segments` | `?page&limit` | List all saved segments |
| `GET` | `/api/segments/:id` | `?preview=true` | Get segment (add `preview` for live count) |
| `DELETE` | `/api/segments/:id` | — | Delete segment |

### Campaigns

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/api/campaigns` | `{ name, channel, messageTemplate, segmentDefinitionId? OR segmentRules? }` | Create in `draft` state; rules are snapshotted immediately |
| `GET` | `/api/campaigns` | `?page&limit&status` | List campaigns with optional status filter |
| `GET` | `/api/campaigns/:id` | — | Campaign detail |
| `POST` | `/api/campaigns/:id/launch` | — | CAS-locks to `running`, batch-inserts deliveries, kicks off async fan-out. Returns immediately. |
| `GET` | `/api/campaigns/:id/analytics` | — | `{ campaign, funnel, rates, conversions }` |

**Analytics response shape:**
```json
{
  "funnel": { "total": 1000, "queued": 0, "sent": 950, "delivered": 900, "opened": 450, "clicked": 158, "failed": 50 },
  "rates": { "deliveryRate": 0.9474, "openRate": 0.5000, "clickRate": 0.3511, "failureRate": 0.0526 },
  "conversions": { "count": 12, "revenue": 14850.00 }
}
```

### Receipts (channel service callback)

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/api/receipts/callback` | `{ messageId, status, timestamp, failureReason? }` | Idempotent receipt webhook. Always responds 200. |

**Valid status values:** `sent` → `delivered` → `opened` → `clicked` (or `failed` from any non-terminal state)

### Channel Service Stub

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/send` | `{ messageId, recipientPhone, recipientEmail, message, channel, callbackUrl }` | Accept a message for delivery simulation. Returns `202` immediately. |
| `GET` | `/health` | — | `{ status, received, inFlight }` |

### Phase 3 (AI features)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/ai/segment` | Natural language → `SegmentRule[]` + live audience count |
| `POST` | `/api/ai/message` | Goal + audience description → personalised message template |

---

## Running Locally

### Backend + Channel Stub

```bash
# 1. Install dependencies
cd backend && npm install

# 2. Configure environment
cp .env.example .env
# Fill DATABASE_URL with your Neon/Supabase connection string
# Optional: OPENAI_API_KEY for AI features

# 3. Generate and run migrations
npm run db:generate
npm run db:migrate

# 4. Start backend dev server
npm run dev
# → http://localhost:3001/health

# 5. In a second terminal — start the channel service stub
cd channel-service-stub && npm install && npm run dev
# → http://localhost:3002/health
```

### Frontend

```bash
cd frontend && npm install && npm run dev
# → http://localhost:5173
```

The Vite dev server proxies all `/api/*` requests to `localhost:3001` — no CORS configuration needed.

### Environment variables

| Variable | Service | Required | Default |
|---|---|---|---|
| `DATABASE_URL` | backend | ✅ | — |
| `PORT` | backend | ❌ | 3001 |
| `OPENAI_API_KEY` | backend | ❌ (disables AI features) | — |
| `CHANNEL_SERVICE_URL` | backend | ❌ | `http://localhost:3002` |
| `CRM_CALLBACK_URL` | channel-service-stub | ❌ | `http://localhost:3001/api/receipts/callback` |
| `PORT` | channel-service-stub | ❌ | 3002 |
| `FAILURE_RATE` | channel-service-stub | ❌ | 0.10 |
| `OPEN_RATE` | channel-service-stub | ❌ | 0.50 |
| `CLICK_RATE` | channel-service-stub | ❌ | 0.35 |
| `VITE_API_URL` | frontend | ❌ (uses proxy in dev) | — |

---

## Scale Assumptions & Production Gaps

### Scale assumptions for this submission

- Audience size: up to ~100k customers per campaign.
- Campaign dispatch is synchronous-per-recipient at launch time (fan-out loop). At 100k recipients this takes ~10s with batched inserts — acceptable for a demo but not production-safe.
- The channel stub fires callbacks serially with a random 1–5s delay per message.

### What I'd change at production scale

| Gap | Production approach |
|---|---|
| Campaign fan-out | Push messageIds onto a Redis / SQS queue; worker pool dispatches and inserts `campaign_deliveries` rows in batches |
| Connection pooling | Use Neon's PgBouncer pooler endpoint; reduce `pool.max` to 3–5 per replica |
| Receipt endpoint throughput | Rate-limit + queue inbound webhooks; process with a background worker |
| Segment compiler | Add EXPLAIN ANALYZE logging; consider materialised RFM scores table refreshed nightly |
| GIN index for tags | `CREATE INDEX USING GIN (tags)` on customers table |
| Auth | JWT-based auth with role separation (marketer vs. admin) |
| Observability | Structured logging (pino), distributed tracing (OpenTelemetry) |

### Production gap: Authentication

Authentication is deliberately omitted to keep scope focused on the CRM data model and async delivery loop. In production, all endpoints would require a JWT bearer token validated against a `users` table with role-based access control.

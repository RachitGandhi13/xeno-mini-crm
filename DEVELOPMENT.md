# Development Log — AI-Native Workflow

This file documents how AI was directed, used, and integrated throughout the build. It is part of the submission to demonstrate an AI-native engineering workflow.

---

## How this log works

Every phase entry records:
- **The problem or decision** I was trying to solve
- **How I directed the AI** — the specific prompts and constraints I gave
- **What the AI produced**
- **What I validated, questioned, or changed**
- **The insight or shortcut gained**

The goal is to show that AI was used as a force-multiplier on engineering decisions, not as a code typist.

---

## Phase 1 — System Architecture & Database Schema

**Date:** 2026-06-09  
**Scope:** Folder structure, Drizzle ORM schema, segment compiler, data ingestion utilities, error middleware.

---

### 1.1 — Locking architectural decisions before writing code

**Problem:** The assignment brief is intentionally open-ended. Before writing a single line of code I needed to lock down a set of decisions that would be hard to change later: deployment target, AI provider, channel status lifecycle, segmentation approach, and authentication scope.

**How I directed the AI:**  
Rather than asking for code immediately, I asked Claude (acting as a Principal Engineer) to ask *me* clarifying questions that would affect the schema and architecture. I provided the context of the assignment and asked it to surface the five most important architectural ambiguities before proceeding.

**What the AI surfaced:**
- Connection pooling strategy for serverless Postgres
- Which AI SDK to use given cost/latency tradeoffs
- Whether conversion should be a synthetic channel status or a DB-level attribution field
- RFM segmentation depth (pre-built dimensions vs. generic rule engine)
- Auth scope

**What I decided (and why):**
- Neon + pg Pool with an explicit note on PgBouncer for production — showed I understand the serverless connection problem
- Vercel AI SDK + `gpt-4o-mini` — `generateObject` for structured output; cheap at demo scale
- Conversion as `attributed_campaign_id` on orders, NOT a channel callback — this is the correct enterprise pattern; channel services don't know about downstream purchases
- Generic AND-rule engine with RFM + demographic fields — gives the AI a clean JSON schema to target
- No auth — document as a production gap rather than half-build it

**Insight:** Forcing the AI to ask clarifying questions upfront prevented at least two schema refactors (the conversion attribution design would have been wrong if I'd let it default to a synthetic status, and the connection pooling note would have been missing from the README).

---

### 1.2 — Designing the schema table ordering

**Problem:** PostgreSQL foreign key constraints require the referenced table to exist before the referencing table. `orders` references `campaigns`, and `campaign_deliveries` references both. In Drizzle, this matters for migration generation.

**How I directed the AI:**  
I described the circular-reference risk and asked it to determine the safe table definition order in `schema.ts`. I also asked it to flag any case where a Drizzle forward-reference (`() => table.id`) would be needed.

**What the AI produced:**  
Definition order: `customers → segment_definitions → campaigns → orders → campaign_deliveries`. No forward references needed because `campaigns` is fully defined before `orders` references it.

**What I validated:**  
Confirmed by tracing the FK graph manually:
- `orders.customer_id → customers` ✓ (customers defined first)
- `orders.attributed_campaign_id → campaigns` ✓ (campaigns defined first)
- `campaign_deliveries.campaign_id → campaigns` ✓
- `campaign_deliveries.customer_id → customers` ✓

No circular references in the final graph.

---

### 1.3 — Index design

**Problem:** The assignment explicitly mentions indexes on foreign keys and frequently queried paths. I needed to justify each index rather than add them cargo-cult style.

**How I directed the AI:**  
I gave it the five tables and asked: "For each index candidate, name the specific query pattern it accelerates and whether it's BTREE or would benefit from GIN/BRIN instead." I did not want a generic "add indexes on all FKs" answer.

**What the AI produced:**  
- Correctly identified that `customer.tags` would need GIN for array containment, not BTREE — and recommended deferring it with a note.
- Identified `campaign_deliveries.status` as a high-value BTREE index for the analytics aggregation (`COUNT(*) GROUP BY status`).
- Flagged that `orders.created_at` matters specifically because the `last_purchase_days` HAVING clause uses `MAX(o.created_at)` — an index scan on `created_at` helps the GROUP BY planner.

**What I changed:**  
Kept GIN on `tags` as a documented future improvement. Added the explicit rationale for each index to the README index table rather than just listing them.

---

### 1.4 — Segment compiler design

**Problem:** The rule engine is the core technical differentiator of this submission. I needed it to: (a) produce safe parameterised SQL, (b) not fetch rows into memory, (c) handle the WHERE vs. HAVING split correctly, (d) be the clean JSON target that the AI layer generates against.

**How I directed the AI:**  
I specified: "Implement the compiler as a pure function — no DB client, no side effects. Classify each rule field as aggregate or non-aggregate. If all rules are non-aggregate, skip the JOIN and GROUP BY entirely. Use positional $N parameters, never string interpolation."

I also gave a concrete SQL example of what the full RFM path should produce, so the AI had a target to code toward rather than improvising the SQL shape.

**What the AI produced:**  
The core `compileSegmentQuery` function with:
- `AGGREGATE_FIELDS` set for O(1) field classification
- `p()` closure that appends to `params[]` and returns `$N` — elegant way to keep parameter indices in sync
- Fast path when no JOIN needed
- `COALESCE(SUM(...), 0)` to handle customers with no orders on aggregate rules

**What I validated:**  
- Manually traced through an example: `[{ field: 'total_spend', operator: 'gte', value: 500 }, { field: 'city', operator: 'eq', value: 'Mumbai' }]`
  - Expected: WHERE clause with `city = $1`, HAVING with `SUM(...) >= $2`, params `['Mumbai', 500]`
  - Actual output: correct ✓
- Checked the `last_purchase_days` case: `EXTRACT(EPOCH FROM ...) / 86400.0` — float division, not integer division. This matters: 86400 integer division would truncate fractional days.

**What I changed:**  
Changed integer `86400` to float `86400.0` in the generated SQL to avoid truncation.

---

### 1.5 — Data ingestion normalisation

**Problem:** The brief explicitly mentions E.164 phone normalisation, email deduplication, and name casing. I wanted this to be a clean, testable pure-function module, not buried in route handlers.

**How I directed the AI:**  
"Write the normalisation as pure functions with no DB calls. Handle: email lowercasing + format validation; name title-casing; E.164 coercion for 10-digit Indian numbers (common dataset format); tag normalisation. Return structured errors rather than throwing, so bulk ingestion can report per-row results."

**What the AI produced:**  
`normalizeCustomer()` and `normalizeBulkCustomers()` with an `IngestionResult` type that separates `data` from `errors`. Bulk function deduplicates within the batch using a `Set<string>`.

**What I validated:**  
- `+91 98765 43210` (with spaces) → `+9198765432` — wait, that's 10 chars after +91, not 11. Let me trace: `9876543210` is 10 digits, `+91` + `9876543210` = `+919876543210` = 13 digits total. Valid E.164. ✓
- `0 9876543210` → strip spaces → `09876543210` → matches `/^0[6-9]\d{9}$/` → `+919876543210` ✓
- `not-a-phone` → `null` with non-fatal warning ✓

**Notable design decision:** Phone normalisation failures are non-fatal. A customer with an unrecognised phone format is still ingested with `phone = null` and a warning in the response. Rejecting the entire record for a bad phone number would be too strict for real-world datasets.

---

### 1.6 — Error handler and PG error code mapping

**Problem:** Raw PostgreSQL error codes (`23505`, `23503`) should never reach the API client. But I also didn't want a blanket 500 for all DB errors.

**How I directed the AI:**  
"Map common pg constraint violation codes to clean HTTP semantics. Export typed `AppError`, `notFound`, `badRequest`, `conflict` factories. Include the `asyncHandler` wrapper so route authors don't need try/catch boilerplate."

**What the AI produced:**  
Clean mapping of `23505 → 409 DUPLICATE_ENTRY`, `23503 → 400 FOREIGN_KEY_VIOLATION`, `23502 → 400 NULL_CONSTRAINT`. `asyncHandler` uses a `void` wrapper to satisfy TypeScript's `void`-returning function constraint.

---

### 1.7 — README completeness check

After writing all Phase 1 code I asked the AI: "Review the README draft against the assignment evaluation criteria. What's missing or undersold?"

**What it flagged:**
- The scale assumptions section was too brief — needed to explicitly contrast "this scope" vs. "production approach" per gap
- The async delivery loop section didn't describe concurrent webhook handling
- The index rationale table was present but didn't explain *why* GIN was deferred

All three were addressed in the final README.

---

## Phase 2 — REST API, Campaign Dispatch & Receipt Endpoint

**Date:** 2026-06-09  
**Scope:** All REST routes, campaign fan-out engine, idempotent receipt endpoint, channel service stub.

---

### 2.1 — Module structure: thin routes, fat services

**Problem:** Express route files can bloat into hundreds of lines if business logic lives inside the handler. I needed a clean separation that would be easy to test and explain in the live code review.

**How I directed the AI:**  
"Each module gets three files: `schema.ts` (Zod validation, no DB knowledge), `service.ts` (all business logic, no `req/res`), `routes.ts` (thin handler that calls service and returns). Services import from DB layer only."

**What the AI produced:**  
Five modules (customers, orders, segments, campaigns, receipts) each with the three-file structure. The `validate.ts` middleware uses `safeParse` and mutates `req.body` with the coerced/defaulted result — downstream handlers can trust the types.

**What I validated:**  
The `asyncHandler` wrapper from Phase 1 means route files have zero try/catch — all errors propagate to the global handler. Confirmed the middleware chain is `validateBody → asyncHandler(handler) → errorHandler`.

---

### 2.2 — Campaign launch: the CAS pattern

**Problem:** Two simultaneous POST requests to `/api/campaigns/:id/launch` could both read `status = 'draft'` and both try to start the campaign, resulting in duplicate delivery rows.

**How I directed the AI:**  
"Use a Compare-and-Swap UPDATE: `UPDATE campaigns SET status='running' WHERE id=$1 AND status='draft' RETURNING *`. If 0 rows come back, the campaign is already locked — throw 409."

**What the AI produced:**  
```typescript
const [locked] = await db.update(campaigns)
  .set({ status: 'running', … })
  .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, 'draft')))
  .returning();
if (!locked) throw new AppError(409, 'Already launched');
```

**Why this works:**  
PostgreSQL serialises concurrent UPDATEs on the same row. Only the first UPDATE passes the `status = 'draft'` predicate and returns a row. The second sees `status = 'running'` and returns 0 rows → 409.

**What I validated:**  
Traced the race condition manually: two threads both read `draft`, both hit the UPDATE, Postgres serialises them, first wins, second gets empty RETURNING. ✓

---

### 2.3 — Fan-out: async dispatch via setImmediate

**Problem:** Launching a 10,000-customer campaign would block the HTTP response for ~10 seconds if dispatch was synchronous. HTTP timeout and poor UX.

**How I directed the AI:**  
"After batch-inserting delivery rows (all status='queued'), return the HTTP response immediately. Kick off dispatch via `setImmediate`. The client polls campaign status to detect completion."

**Tradeoff I made explicit:**  
`setImmediate` is a in-process fire-and-forget — it doesn't survive a server restart. If the Node process crashes after inserting `queued` rows but before dispatch completes, those rows never get sent. In production this would use BullMQ + Redis for persistent job queuing. I noted this in the README rather than half-implementing BullMQ.

**What the AI produced:**  
`campaignDispatcher.ts` uses `Promise.allSettled` on chunks of 50 concurrent channel-service POSTs. `allSettled` (not `all`) means a single-message failure never aborts the batch. After all chunks complete, the campaign is marked `completed`.

---

### 2.4 — Idempotency on the receipt endpoint

**Problem:** Channel services in the real world retry failed callback deliveries. Our receipt endpoint must handle the same `{ messageId, status: 'delivered' }` arriving twice without corrupting analytics.

**How I directed the AI:**  
"Implement three layers of protection:
1. Unique index on `message_id` (O(1) lookup, enforced at DB layer)
2. Status-equality check before writing (same status = no-op)
3. Transition guard: only allow known-valid state transitions"

**What the AI produced:**  
`receipts.service.processReceipt()`:
```
unknown messageId  → 200, processed: false, reason: 'unknown_message_id'
same status again  → 200, processed: false, reason: 'already_processed'
invalid transition → 200, processed: false, reason: 'invalid_transition'
valid transition   → UPDATE, 200, processed: true
```

The endpoint always returns 200. This is intentional: returning 4xx would cause the channel service to retry forever.

**Key insight:** The receipt endpoint is a sink, not a gate. Its job is to absorb events idempotently, not to validate the channel service's behaviour.

---

### 2.5 — Channel service stub: the probability model

**Problem:** The stub needed to simulate a realistic delivery funnel, not just always succeed. A 100% delivery rate would make the analytics look trivial.

**How I directed the AI:**  
"Model the lifecycle as a sequential async chain: sent (always) → delivered (90%) OR failed (10%) → opened (50%) → clicked (35%). Each stage awaits the previous callback so the CRM always receives events in order. Expose the rates as env vars so I can tweak them for the demo."

**What the AI produced:**  
`simulator.ts` with `FAILURE_RATE`, `OPEN_RATE`, `CLICK_RATE` constants configurable via env. The chain `await post('sent'); await sleep(…); await post('delivered')` ensures sequential delivery.

**What I validated:**  
- Failure path: if `Math.random() < FAILURE_RATE`, fires `failed` and `return`s — no subsequent stages. ✓
- Sequential ordering: each `await post(...)` waits for the CRM to respond before the next sleep. This means the CRM's transition guard never sees out-of-order events from this stub. ✓

---

### 2.6 — Conversion attribution inside a transaction

**Problem:** If we insert an order and then the attribution check fails, we'd have an unattributed order. The attribution must be atomic with the order creation.

**How I directed the AI:**  
"Wrap order creation and attribution in a single `db.transaction()`. Insert the order first, then run the attribution query on the same TX. If attribution is found, UPDATE the order before the TX commits."

**What the AI produced:**  
```typescript
db.transaction(async (tx) => {
  const [newOrder] = await tx.insert(orders).values(…).returning();
  const result = await tx.execute(sql`SELECT campaign_id FROM campaign_deliveries WHERE … LIMIT 1`);
  if (result.rows.length > 0) {
    await tx.update(orders).set({ attributedCampaignId: … }).where(…).returning();
  }
  return attributed ?? newOrder;
});
```

**Why the transaction matters:**  
Without it, a race condition could produce an attributed order pointing to a campaign that was deleted between the check and the write. The transaction's snapshot isolation prevents this.

---

## Phase 3 — AI Features & Frontend

**Date:** 2026-06-09  
**Scope:** AI NL→segment endpoint, message generation endpoint, React + Vite + Tailwind SPA, AI Copilot chatbox, full dashboard with live analytics funnel.

---

### 3.1 — AI segment generation with `generateObject`

**Problem:** Free-form text like "customers who haven't bought in 60 days and spent over ₹5000" needs to become a type-safe `SegmentRule[]` that can be directly passed to `compileSegmentQuery`. The AI must not be able to generate rules with fields or operators that the compiler doesn't understand.

**How I directed the AI:**  
"Use Vercel AI SDK `generateObject` with a Zod schema that mirrors the `SegmentRule` discriminated union exactly. The model's output is constrained to valid field/operator pairs at the Zod layer — it can't hallucinate a new field. After generating, run both a COUNT query and a SAMPLE query in parallel so the API response includes audience size and 5 example customers in a single round-trip."

**What the AI produced:**  
`ai.service.ts` with a `SegmentOutputSchema` that forces `rules: SegmentRule[]`, a `segmentName: string` (up to 60 chars), and an `explanation: string`. The system prompt includes field glossary, operator semantics, and INR currency notes so the model correctly interprets Indian market queries.

**Key design insight:** Running `COUNT(*)` and `SELECT id, name, email LIMIT 5` in `Promise.all` via the raw pg pool (not Drizzle) keeps round-trips to 1 extra DB call per AI call, and the audience preview makes the segment immediately actionable without a separate API call.

---

### 3.2 — AI message generation

**Problem:** Once a marketer sees their AI-generated segment, they need a message template without having to write one from scratch. The AI needs context about the audience (segment name, rules) and the channel to write appropriately.

**How I directed the AI:**  
"Accept `audienceDescription`, `campaignGoal`, and `channel` in the request. Generate a `generateObject` call returning `{ template, explanation }`. The template must use `{{name}}` and `{{city}}` placeholders that the backend interpolation engine already handles."

**What the AI produced:**  
`/api/ai/message` endpoint that generates a template respecting the channel constraint (shorter for SMS, emoji-friendly for WhatsApp, formal for email) with a one-line rationale.

---

### 3.3 — Frontend architecture decision

**Problem:** The brief says "React SPA or Next.js." I needed to choose one that matches the single-backend-process architecture and doesn't introduce SSR complexity.

**Decision:** React + Vite SPA, not Next.js.  
**Rationale:** The backend is already serving REST APIs from a single Node process. Adding Next.js would mean two server processes in production with no benefit (we don't need SSR for a marketer dashboard). Vite's dev proxy (`/api → localhost:3001`) keeps local development zero-config.

---

### 3.4 — AI Copilot UX flow

**Problem:** The AI Copilot needed a complete flow from NL input to a launched campaign, not just a chatbox that shows raw JSON. The flow had to be:
1. Type NL prompt
2. See live audience rules + count + sample names
3. Either save as a reusable segment OR flow into campaign creation
4. AI auto-generates message template for the chosen channel
5. Confirm and launch

**How I directed the AI:**  
"Model the component as a state machine with 5 explicit phases: `idle → segment_loading → segment_ready → campaign_form → done`. Use discriminated unions so each phase's data is typed correctly. The `useMutation` hooks are phase-independent — they can be called from any phase."

**What the AI produced:**  
`AICopilot.tsx` with a `Phase` discriminated union type. Each phase renders a distinct UI: idle shows a placeholder, loading shows skeletons, `segment_ready` shows rule chips + audience count + CTAs, `campaign_form` shows an inline form with AI-generated template, `done` shows a success message.

**What I validated:**  
- The `campaign_form → back → segment_ready` transition correctly restores the previous result without re-fetching. ✓
- The "Start over" reset clears all phase state and refocuses the textarea. ✓

---

### 3.5 — Live analytics funnel with Recharts

**Problem:** The dashboard needed a visual delivery funnel (Sent → Delivered → Opened → Clicked → Converted) that polled the most recently completed campaign.

**Design decision:** Query `campaigns?status=completed&limit=1` to find the latest campaign, then fetch its analytics. This means the funnel always shows real data from the most recent dispatch, not a mock or aggregate.

**Technical note:** Using `enabled: !!latestCampaignId` in the analytics query prevents TanStack Query from firing before the campaign ID is available. The loading state correctly shows skeletons during both the campaign fetch and the analytics fetch.

---

### 3.6 — TypeScript error: `import.meta.env` on strict tsconfig

**Problem:** The frontend's strict tsconfig didn't include the Vite type extensions, so `import.meta.env.VITE_API_URL` caused TS2339: "Property 'env' does not exist on type 'ImportMeta'".

**Fix:** Added `src/vite-env.d.ts` with `/// <reference types="vite/client" />`. This is the standard Vite scaffold approach — it augments the global `ImportMeta` interface with `env` and all `VITE_*` env vars. Zero configuration change needed in `tsconfig.json`.

---

## Patterns & Principles from this workflow

**1. Clarify before generating.**  
The most expensive mistakes are schema mistakes — they require migrations to fix. Forcing a clarification round before writing the schema saved two refactors.

**2. Give the AI a target, not a spec.**  
For the segment compiler, providing a concrete SQL example of the intended output was more effective than describing it in prose. The AI coded to the target rather than inventing its own SQL shape.

**3. Validate pure functions manually.**  
AI-generated pure functions (segment compiler, phone normaliser) are fast to validate by tracing concrete examples. Don't ship without tracing at least one happy path and one edge case.

**4. Use AI to audit its own output.**  
Asking "what did you miss in this README?" after writing it catches gaps the author (AI or human) is blind to — the same cognitive bias that makes self-review less effective than peer review.

**5. Record the why, not just the what.**  
The `attributed_campaign_id` decision is only understandable if you know *why* conversion tracking belongs in the orders table rather than as a channel callback. That reasoning is what gets tested in a live code review.
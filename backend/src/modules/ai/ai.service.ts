import { z } from 'zod';
import { pool } from '../../db';
import { compileSegmentQuery } from '../../lib/segmentCompiler';
import { AppError } from '../../middleware/errorHandler';
import type { SegmentRule } from '../../db/schema';
import type { AIMessageRequest } from './ai.schema';

// ─── Zod schemas for validating parsed AI responses ──────────────────────────

const RuleSchema = z.object({
  field: z.enum(['total_spend', 'order_count', 'last_purchase_days', 'city', 'tag']),
  operator: z.enum(['gte', 'lte', 'gt', 'lt', 'eq', 'neq', 'contains']),
  value: z.union([z.string(), z.number()]),
});

const SegmentOutputSchema = z.object({
  rules: z.array(RuleSchema).min(1).max(10),
  segmentName: z.string(),
  explanation: z.string(),
});

const MessageOutputSchema = z.object({
  template: z.string(),
  subject: z.string().optional(),
  explanation: z.string(),
});

// ─── Helper: call Gemini and extract JSON from the response ──────────────────

function extractJson(text: string): unknown {
  // Strip markdown code fences if present
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(clean);
}

async function callClaude(system: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AppError(503, 'ANTHROPIC_API_KEY is not configured', 'AI_NOT_CONFIGURED');

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AppError(502, `AI network error: ${msg}`, 'AI_ERROR');
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AppError(502, `AI error (HTTP ${res.status}): ${body}`, 'AI_ERROR');
  }

  const data = await res.json() as { content?: { type: string; text: string }[] };
  const text = data.content?.[0]?.text;
  if (!text) throw new AppError(502, 'AI returned empty response', 'AI_ERROR');
  return text;
}

// ─── System prompts ───────────────────────────────────────────────────────────

const SEGMENT_SYSTEM_PROMPT = `You are an AI assistant for a CRM platform used by direct-to-consumer brands in India.
Convert a marketer's natural language query into a structured segment rule set.

Available fields:
- "total_spend"        — customer's total purchase amount in INR across all orders
- "order_count"        — number of orders placed
- "last_purchase_days" — days since most recent order (lower = more recent shopper)
- "city"               — customer's city string (use Title Case, e.g. "Delhi")
- "tag"                — a tag present in the customer's tags array (lowercase, e.g. "vip")

Available operators: gte (≥), lte (≤), gt (>), lt (<), eq (=), neq (≠), contains

Combination: all rules are AND-combined.

Common interpretations:
- "recent / active customers"      → last_purchase_days lte 30
- "inactive / dormant / win-back"  → last_purchase_days gte 90
- "high value / big spenders"      → total_spend gte 5000
- "new customers"                  → order_count eq 1
- "loyal / repeat buyers"          → order_count gte 3
- "from [city]"                    → city eq "[City]"
- "VIP / premium"                  → tag contains "vip"
- "₹X" or "$X"                     → treat as total_spend value in INR
- "last month"                     → last_purchase_days lte 30
- "last 3 months"                  → last_purchase_days lte 90
- "haven't bought in N days"       → last_purchase_days gte N

Always produce 1–5 rules. Respond ONLY with valid JSON matching this exact shape:
{
  "rules": [{ "field": "...", "operator": "...", "value": "..." }],
  "segmentName": "Short descriptive name",
  "explanation": "One sentence explanation"
}`;

const MESSAGE_SYSTEM_PROMPT = `You are a CRM copywriter for direct-to-consumer brands in India.
Write a short, personalised marketing message for the given campaign.

Rules:
- Use {{name}} for the customer's first name where natural
- Use {{city}} for the customer's city if location is relevant
- WhatsApp / SMS: under 160 characters, conversational tone
- Email: 2–3 sentences, warmer tone, include a subject line
- RCS: 1–2 sentences with an emoji allowed
- Use ₹ for prices, not $
- End with a clear call-to-action
- Be warm, personal, and benefit-focused — not spammy

Respond ONLY with valid JSON matching this exact shape:
{
  "template": "message text with {{name}} placeholders",
  "subject": "email subject line or null",
  "explanation": "Why this message works"
}`;

// ─── AI segment generation ────────────────────────────────────────────────────

interface SampleCustomer {
  id: string;
  name: string;
  email: string;
  city: string | null;
}

export interface AISegmentResult {
  rules: SegmentRule[];
  segmentName: string;
  explanation: string;
  audienceCount: number;
  sample: SampleCustomer[];
  compiledSql: string;
}

export async function generateSegmentFromPrompt(prompt: string): Promise<AISegmentResult> {
  // Step 1: Call Gemini and parse the JSON response
  const text = await callClaude(SEGMENT_SYSTEM_PROMPT, prompt);

  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    throw new AppError(502, 'AI returned invalid JSON — please try again', 'AI_PARSE_ERROR');
  }

  const validated = SegmentOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new AppError(502, 'AI response did not match expected format — please try again', 'AI_PARSE_ERROR');
  }

  const rules = validated.data.rules as SegmentRule[];

  // Step 2: Compile rules to SQL and run against the live database
  const compiled = compileSegmentQuery(rules);

  const [countResult, sampleResult] = await Promise.all([
    pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM (${compiled.sql}) AS _seg`,
      compiled.params
    ),
    pool.query<SampleCustomer>(
      `${compiled.sql} LIMIT 5`,
      compiled.params
    ),
  ]);

  return {
    rules,
    segmentName: validated.data.segmentName,
    explanation: validated.data.explanation,
    audienceCount: parseInt(countResult.rows[0].total, 10),
    sample: sampleResult.rows,
    compiledSql: compiled.sql,
  };
}

// ─── AI message template generation ──────────────────────────────────────────

export interface AIMessageResult {
  template: string;
  subject?: string;
  explanation: string;
}

export async function generateMessageTemplate(
  input: AIMessageRequest
): Promise<AIMessageResult> {
  const text = await callClaude(
    MESSAGE_SYSTEM_PROMPT,
    `Channel: ${input.channel}\nAudience: ${input.audienceDescription}\nCampaign goal: ${input.campaignGoal}`
  );

  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    throw new AppError(502, 'AI returned invalid JSON — please try again', 'AI_PARSE_ERROR');
  }

  const validated = MessageOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new AppError(502, 'AI response did not match expected format — please try again', 'AI_PARSE_ERROR');
  }

  return {
    template: validated.data.template,
    subject: validated.data.subject ?? undefined,
    explanation: validated.data.explanation,
  };
}

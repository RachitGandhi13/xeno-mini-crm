import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { pool } from '../../db';
import { compileSegmentQuery } from '../../lib/segmentCompiler';
import { AppError } from '../../middleware/errorHandler';
import type { SegmentRule } from '../../db/schema';
import type { AIMessageRequest } from './ai.schema';

// ─── Zod schema for generateObject output ────────────────────────────────────
// Must mirror SegmentRule exactly so the output passes directly into
// compileSegmentQuery without a transform step.

const RuleSchema = z.object({
  field: z.enum(['total_spend', 'order_count', 'last_purchase_days', 'city', 'tag']),
  operator: z.enum(['gte', 'lte', 'gt', 'lt', 'eq', 'neq', 'contains']),
  // Gemini doesn't support union types — always emit as string, convert to number after
  value: z.string().describe('Comparison value as a string. For numeric fields use digits only e.g. "5000". For city use Title Case e.g. "Delhi". For tag use lowercase e.g. "vip".'),
});

const SegmentOutputSchema = z.object({
  rules: z
    .array(RuleSchema)
    .min(1)
    .max(10)
    .describe('Array of segment rules — all conditions are AND-combined'),
  segmentName: z
    .string()
    .max(60)
    .describe('Concise, descriptive name for this customer segment (e.g. "Delhi High-Spenders Q1")'),
  explanation: z
    .string()
    .max(200)
    .describe('One sentence explaining what this segment captures in plain English'),
});

const MessageOutputSchema = z.object({
  template: z
    .string()
    .describe('Message copy with {{name}} and {{city}} placeholders where appropriate'),
  subject: z
    .string()
    .optional()
    .describe('Subject line — only for email channel'),
  explanation: z
    .string()
    .max(150)
    .describe('Why this message is effective for this audience'),
});

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

Always produce 1–5 rules that best capture the intent. Suggest a short, descriptive segment name.`;

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
- Be warm, personal, and benefit-focused — not spammy`;

// ─── AI segment generation ─────────────────────────────────────────────────────

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
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new AppError(503, 'GOOGLE_GENERATIVE_AI_API_KEY is not configured', 'AI_NOT_CONFIGURED');
  }

  // Step 1: Generate structured rules from natural language
  const genResult = await generateObject({
    model: google('gemini-2.0-flash'),
    schema: SegmentOutputSchema,
    system: SEGMENT_SYSTEM_PROMPT,
    prompt,
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AppError(502, `OpenAI error: ${msg}`, 'AI_ERROR');
  });

  const { object } = genResult;
  // Convert numeric strings back to numbers (Gemini schema only supports string values)
  const rules = object.rules.map((r) => ({
    ...r,
    value: /^-?\d+(\.\d+)?$/.test(String(r.value)) ? Number(r.value) : r.value,
  })) as SegmentRule[];

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
    segmentName: object.segmentName,
    explanation: object.explanation,
    audienceCount: parseInt(countResult.rows[0].total, 10),
    sample: sampleResult.rows,
    compiledSql: compiled.sql,
  };
}

// ─── AI message template generation ───────────────────────────────────────────

export interface AIMessageResult {
  template: string;
  subject?: string;
  explanation: string;
}

export async function generateMessageTemplate(
  input: AIMessageRequest
): Promise<AIMessageResult> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new AppError(503, 'GOOGLE_GENERATIVE_AI_API_KEY is not configured', 'AI_NOT_CONFIGURED');
  }

  const { object } = await generateObject({
    model: google('gemini-2.0-flash'),
    schema: MessageOutputSchema,
    system: MESSAGE_SYSTEM_PROMPT,
    prompt: `Channel: ${input.channel}
Audience: ${input.audienceDescription}
Campaign goal: ${input.campaignGoal}`,
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AppError(502, `OpenAI error: ${msg}`, 'AI_ERROR');
  });

  return {
    template: object.template,
    subject: object.subject,
    explanation: object.explanation,
  };
}

import { z } from 'zod';

// Mirrors the SegmentRule interface in db/schema.ts.
// Defined here so Zod is not imported into the DB layer.
export const SegmentRuleSchema = z.object({
  field: z.enum(['total_spend', 'order_count', 'last_purchase_days', 'city', 'tag']),
  operator: z.enum(['gte', 'lte', 'gt', 'lt', 'eq', 'neq', 'contains']),
  value: z.union([z.string(), z.number()]),
});

export const CreateSegmentSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  rules: z.array(SegmentRuleSchema).min(1, 'At least one rule required'),
});

export const PreviewSegmentSchema = z.object({
  rules: z.array(SegmentRuleSchema).min(1),
});

export const ListSegmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateSegmentInput = z.infer<typeof CreateSegmentSchema>;
export type PreviewSegmentInput = z.infer<typeof PreviewSegmentSchema>;

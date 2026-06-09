import { z } from 'zod';
import { SegmentRuleSchema } from '../segments/segments.schema';

export const CreateCampaignSchema = z
  .object({
    name: z.string().min(1).max(200),
    channel: z.enum(['whatsapp', 'sms', 'email', 'rcs']),
    messageTemplate: z
      .string()
      .min(1, 'Message template cannot be empty')
      .max(2000),
    // Exactly one of these must be provided:
    segmentDefinitionId: z.string().uuid().optional(),
    segmentRules: z.array(SegmentRuleSchema).min(1).optional(),
  })
  .refine((d) => d.segmentDefinitionId !== undefined || d.segmentRules !== undefined, {
    message: 'Provide either segmentDefinitionId or segmentRules',
    path: ['segmentDefinitionId'],
  });

export const ListCampaignsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'running', 'completed', 'failed']).optional(),
});

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

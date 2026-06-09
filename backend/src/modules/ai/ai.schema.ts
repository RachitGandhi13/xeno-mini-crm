import { z } from 'zod';

export const AISegmentRequestSchema = z.object({
  prompt: z.string().min(3, 'Prompt must be at least 3 characters').max(500),
});

export const AIMessageRequestSchema = z.object({
  audienceDescription: z.string().min(3).max(300),
  campaignGoal: z.string().min(3).max(300),
  channel: z.enum(['whatsapp', 'sms', 'email', 'rcs']),
});

export type AISegmentRequest = z.infer<typeof AISegmentRequestSchema>;
export type AIMessageRequest = z.infer<typeof AIMessageRequestSchema>;

import { z } from 'zod';

export const ReceiptCallbackSchema = z.object({
  messageId: z.string().min(1),
  status: z.enum(['sent', 'delivered', 'opened', 'clicked', 'failed']),
  timestamp: z.string().datetime({ message: 'timestamp must be an ISO 8601 datetime string' }),
  failureReason: z.string().optional(),
});

export type ReceiptCallbackPayload = z.infer<typeof ReceiptCallbackSchema>;

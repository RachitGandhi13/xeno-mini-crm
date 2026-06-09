import { z } from 'zod';

export const OrderItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

export const CreateOrderSchema = z.object({
  customerId: z.string().uuid(),
  totalAmount: z.number().positive(),
  items: z.array(OrderItemSchema).optional(),
});

export const ListOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

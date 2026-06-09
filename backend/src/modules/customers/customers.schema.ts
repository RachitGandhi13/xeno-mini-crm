import { z } from 'zod';

export const CreateCustomerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  phone: z.string().optional(),
  city: z.string().max(100).optional(),
  tags: z.array(z.string()).optional().default([]),
});

export const BulkCreateCustomersSchema = z.object({
  customers: z
    .array(z.record(z.unknown()))
    .min(1, 'At least one customer required')
    .max(1000, 'Maximum 1000 customers per batch'),
});

export const ListCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  city: z.string().optional(),
  search: z.string().optional(),
});

export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof ListCustomersQuerySchema>;

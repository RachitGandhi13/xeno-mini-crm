import { sql, eq, ilike, and, count, desc } from 'drizzle-orm';
import { db } from '../../db';
import { customers } from '../../db/schema';
import {
  normalizeCustomer,
  normalizeBulkCustomers,
  type RawCustomerInput,
} from '../../lib/dataIngestion';
import { AppError, notFound } from '../../middleware/errorHandler';
import type { CreateCustomerInput, ListCustomersQuery } from './customers.schema';

// ─── Create / upsert single customer ─────────────────────────────────────────

export async function createOrUpdateCustomer(input: CreateCustomerInput) {
  const result = normalizeCustomer(input as RawCustomerInput);
  if (!result.data) {
    throw new AppError(400, result.errors[0].message, 'VALIDATION_ERROR');
  }

  // INSERT … ON CONFLICT (email) DO UPDATE merges the normalised record.
  // We explicitly list columns to avoid accidentally overwriting fields with
  // nulls from a sparse update payload.
  const [customer] = await db
    .insert(customers)
    .values(result.data)
    .onConflictDoUpdate({
      target: customers.email,
      set: {
        name: sql`EXCLUDED.name`,
        phone: sql`EXCLUDED.phone`,
        city: sql`EXCLUDED.city`,
        tags: sql`EXCLUDED.tags`,
        updatedAt: sql`NOW()`,
      },
    })
    .returning();

  return { customer, warnings: result.errors };
}

// ─── Bulk ingest ──────────────────────────────────────────────────────────────

export async function bulkCreateCustomers(rawInputs: RawCustomerInput[]) {
  const { valid, invalid } = normalizeBulkCustomers(rawInputs);

  let inserted: typeof customers.$inferSelect[] = [];

  if (valid.length > 0) {
    // Single INSERT with all valid rows — pg handles batching internally.
    // ON CONFLICT upserts so re-running the same dataset is idempotent.
    inserted = await db
      .insert(customers)
      .values(valid)
      .onConflictDoUpdate({
        target: customers.email,
        set: {
          name: sql`EXCLUDED.name`,
          phone: sql`EXCLUDED.phone`,
          city: sql`EXCLUDED.city`,
          tags: sql`EXCLUDED.tags`,
          updatedAt: sql`NOW()`,
        },
      })
      .returning();
  }

  return {
    inserted: inserted.length,
    failed: invalid.length,
    errors: invalid,
  };
}

// ─── List customers (paginated) ───────────────────────────────────────────────

export async function listCustomers(query: ListCustomersQuery) {
  const { page, limit, city, search } = query;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (city) conditions.push(eq(customers.city, city));
  if (search) conditions.push(ilike(customers.name, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(where)
      .orderBy(desc(customers.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(customers)
      .where(where),
  ]);

  return {
    data: rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─── Get single customer ──────────────────────────────────────────────────────

export async function getCustomerById(id: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);

  if (!customer) throw notFound('Customer');
  return customer;
}

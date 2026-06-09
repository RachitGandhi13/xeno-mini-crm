import { sql, eq, desc, count } from 'drizzle-orm';
import { db, pool } from '../../db';
import { segmentDefinitions } from '../../db/schema';
import type { SegmentRule } from '../../db/schema';
import { compileSegmentQuery } from '../../lib/segmentCompiler';
import { notFound } from '../../middleware/errorHandler';
import type { CreateSegmentInput } from './segments.schema';

// ─── Preview (without saving) ─────────────────────────────────────────────────

export async function previewSegment(rules: SegmentRule[]) {
  const compiled = compileSegmentQuery(rules);

  // Run COUNT and sample in parallel — both use the same compiled query.
  // The subquery wrapper for COUNT avoids fetching all rows just to count them.
  const countSql = `SELECT COUNT(*) AS total FROM (${compiled.sql}) AS _seg`;

  const [countResult, sampleResult] = await Promise.all([
    pool.query<{ total: string }>(countSql, compiled.params),
    pool.query<{ id: string; email: string; name: string; phone: string | null; city: string | null }>(
      `${compiled.sql} LIMIT 10`,
      compiled.params
    ),
  ]);

  return {
    count: parseInt(countResult.rows[0].total, 10),
    sample: sampleResult.rows,
    compiledSql: compiled.sql, // exposed for transparency / debugging
  };
}

// ─── Save a named segment ──────────────────────────────────────────────────────

export async function createSegment(input: CreateSegmentInput) {
  const [segment] = await db
    .insert(segmentDefinitions)
    .values({
      name: input.name,
      description: input.description ?? null,
      rules: input.rules as SegmentRule[],
    })
    .returning();

  return segment;
}

// ─── List segments ─────────────────────────────────────────────────────────────

export async function listSegments(opts: { page: number; limit: number }) {
  const { page, limit } = opts;
  const offset = (page - 1) * limit;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(segmentDefinitions)
      .orderBy(desc(segmentDefinitions.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(segmentDefinitions),
  ]);

  return {
    data: rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Get single segment (+ live preview count) ────────────────────────────────

export async function getSegmentById(id: string, withPreview = false) {
  const [segment] = await db
    .select()
    .from(segmentDefinitions)
    .where(eq(segmentDefinitions.id, id))
    .limit(1);

  if (!segment) throw notFound('Segment');

  if (!withPreview) return { segment };

  const preview = await previewSegment(segment.rules as SegmentRule[]);
  return { segment, preview };
}

// ─── Delete a segment ─────────────────────────────────────────────────────────

export async function deleteSegment(id: string) {
  const [deleted] = await db
    .delete(segmentDefinitions)
    .where(eq(segmentDefinitions.id, id))
    .returning({ id: segmentDefinitions.id });

  if (!deleted) throw notFound('Segment');
  return deleted;
}

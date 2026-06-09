import type { SegmentRule, SegmentRuleField, SegmentOperator } from '../db/schema';

// Fields that require a JOIN to orders and live in the HAVING clause.
// All other fields are simple column predicates in the WHERE clause.
const AGGREGATE_FIELDS = new Set<SegmentRuleField>([
  'total_spend',
  'order_count',
  'last_purchase_days',
]);

const SQL_OPERATOR: Record<SegmentOperator, string> = {
  gte: '>=',
  lte: '<=',
  gt: '>',
  lt: '<',
  eq: '=',
  neq: '<>',
  // 'contains' is special-cased per field below (array membership vs. LIKE).
  contains: '=',
};

export interface CompiledQuery {
  sql: string;
  params: (string | number)[];
}

/**
 * Compiles an array of SegmentRule objects into a parameterised PostgreSQL
 * SELECT that returns matching customer rows.
 *
 * Design decisions:
 * - Purely non-aggregate rules → no JOIN, no GROUP BY. Fast path.
 * - Any aggregate rule → LEFT JOIN orders + GROUP BY + HAVING. The LEFT JOIN
 *   preserves customers with zero orders; COALESCE handles NULL aggregates.
 * - All rules are AND-combined (implicit AND semantics per product spec).
 * - Parameter indices ($1, $2, …) are generated in rule order so the caller
 *   can pass `params` directly to pg's parameterised query API.
 * - No raw string interpolation of user values — only $N placeholders.
 */
export function compileSegmentQuery(rules: SegmentRule[]): CompiledQuery {
  if (rules.length === 0) {
    return {
      sql: 'SELECT id, email, name, phone, city FROM customers',
      params: [],
    };
  }

  const params: (string | number)[] = [];
  const whereFragments: string[] = [];
  const havingFragments: string[] = [];
  const needsJoin = rules.some((r) => AGGREGATE_FIELDS.has(r.field));

  // Returns the next positional placeholder and registers the value.
  const p = (value: string | number): string => {
    params.push(value);
    return `$${params.length}`;
  };

  for (const rule of rules) {
    const op = SQL_OPERATOR[rule.operator];

    switch (rule.field) {
      case 'city':
        whereFragments.push(`c.city ${op} ${p(rule.value)}`);
        break;

      case 'tag':
        // Array containment: does the customer's tags array include the value?
        // Operator is intentionally ignored — only 'contains'/'eq' make sense.
        whereFragments.push(`${p(rule.value)} = ANY(c.tags)`);
        break;

      case 'total_spend':
        // COALESCE so customers with no orders have a spend of 0, not NULL,
        // and correctly fail a 'gte 100' filter instead of being excluded.
        havingFragments.push(
          `COALESCE(SUM(o.total_amount::numeric), 0) ${op} ${p(Number(rule.value))}`
        );
        break;

      case 'order_count':
        havingFragments.push(`COUNT(o.id) ${op} ${p(Number(rule.value))}`);
        break;

      case 'last_purchase_days':
        // Number of days since the customer's most recent order.
        // Customers with no orders have MAX(created_at) = NULL → EXTRACT returns
        // NULL → the HAVING condition evaluates false, excluding them.
        havingFragments.push(
          `EXTRACT(EPOCH FROM (NOW() - MAX(o.created_at))) / 86400.0 ${op} ${p(Number(rule.value))}`
        );
        break;
    }
  }

  if (!needsJoin) {
    const where =
      whereFragments.length > 0 ? `WHERE ${whereFragments.join(' AND ')}` : '';
    return {
      sql: ['SELECT id, email, name, phone, city FROM customers c', where]
        .filter(Boolean)
        .join('\n'),
      params,
    };
  }

  const where =
    whereFragments.length > 0 ? `WHERE ${whereFragments.join(' AND ')}` : '';
  const having =
    havingFragments.length > 0 ? `HAVING ${havingFragments.join(' AND ')}` : '';

  const sql = [
    'SELECT c.id, c.email, c.name, c.phone, c.city',
    'FROM customers c',
    'LEFT JOIN orders o ON o.customer_id = c.id',
    where,
    'GROUP BY c.id, c.email, c.name, c.phone, c.city',
    having,
  ]
    .filter(Boolean)
    .join('\n');

  return { sql, params };
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_FIELDS = new Set<string>([
  'total_spend',
  'order_count',
  'last_purchase_days',
  'city',
  'tag',
]);

const VALID_OPERATORS = new Set<string>([
  'gte', 'lte', 'gt', 'lt', 'eq', 'neq', 'contains',
]);

/**
 * Parses and validates a raw JSON payload as SegmentRule[].
 * Throws a descriptive Error on the first invalid rule — callers should
 * catch and surface this as a 400 response.
 */
export function validateSegmentRules(raw: unknown): SegmentRule[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('rules must be a non-empty array');
  }

  return raw.map((item, i) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`rules[${i}] must be an object`);
    }
    const { field, operator, value } = item as Record<string, unknown>;

    if (!VALID_FIELDS.has(String(field))) {
      throw new Error(
        `rules[${i}].field "${field}" is invalid. Valid values: ${[...VALID_FIELDS].join(', ')}`
      );
    }
    if (!VALID_OPERATORS.has(String(operator))) {
      throw new Error(
        `rules[${i}].operator "${operator}" is invalid. Valid values: ${[...VALID_OPERATORS].join(', ')}`
      );
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error(`rules[${i}].value must be a string or number`);
    }

    return { field, operator, value } as SegmentRule;
  });
}

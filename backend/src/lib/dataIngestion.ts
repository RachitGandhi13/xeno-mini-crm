// Customer data normalisation and ingestion validation utilities.
//
// All normalisation is pure (no DB calls) so it can be unit-tested cheaply
// and reused by both the single-record API and the bulk CSV import endpoint.

export interface RawCustomerInput {
  email?: unknown;
  name?: unknown;
  phone?: unknown;
  city?: unknown;
  tags?: unknown;
}

export interface NormalizedCustomer {
  email: string;
  name: string;
  phone: string | null;
  city: string | null;
  tags: string[];
}

export interface FieldError {
  field: string;
  message: string;
  receivedValue: unknown;
}

export interface IngestionResult {
  data: NormalizedCustomer | null;
  errors: FieldError[];
}

// ─── E.164 phone normalisation ────────────────────────────────────────────────

// Matches a fully-formed E.164 number: + followed by 7–15 digits.
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

function normalizePhone(raw: unknown): { value: string | null; error?: FieldError } {
  if (raw === null || raw === undefined || raw === '') {
    return { value: null };
  }

  // Strip whitespace, hyphens, dots, parentheses before attempting parse.
  const stripped = String(raw).trim().replace(/[\s\-().]/g, '');

  if (E164_REGEX.test(stripped)) {
    return { value: stripped };
  }

  // Heuristic coercion for bare 10-digit Indian mobile numbers.
  if (/^[6-9]\d{9}$/.test(stripped)) {
    return { value: `+91${stripped}` };
  }
  // With leading 0 (trunk prefix in India).
  if (/^0[6-9]\d{9}$/.test(stripped)) {
    return { value: `+91${stripped.slice(1)}` };
  }

  // Unrecognised format: store null with a non-fatal warning.
  // The caller decides whether to reject or accept with a warning.
  return {
    value: null,
    error: {
      field: 'phone',
      message: `Cannot normalise "${raw}" to E.164 — stored as null`,
      receivedValue: raw,
    },
  };
}

// ─── Email normalisation ──────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(
  raw: unknown
): { value: string; error?: never } | { value: null; error: FieldError } {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    return {
      value: null,
      error: { field: 'email', message: 'Email is required', receivedValue: raw },
    };
  }
  const normalized = raw.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) {
    return {
      value: null,
      error: {
        field: 'email',
        message: `"${raw}" is not a valid email address`,
        receivedValue: raw,
      },
    };
  }
  return { value: normalized };
}

// ─── Name normalisation ───────────────────────────────────────────────────────

function normalizeName(raw: unknown): string {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return 'Unknown';
  return raw
    .trim()
    .toLowerCase()
    // Title-case each word: "RAHUL sharma" → "Rahul Sharma"
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Tags normalisation ───────────────────────────────────────────────────────

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map((t) => t.trim().toLowerCase());
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Normalises a single raw customer input.
 * Returns { data: null, errors } when the record is fatally invalid (bad email).
 * Returns { data, errors: [warnings] } when normalisation succeeded but had
 * non-fatal issues (e.g. unrecognised phone format set to null).
 */
export function normalizeCustomer(input: RawCustomerInput): IngestionResult {
  const errors: FieldError[] = [];

  const emailResult = normalizeEmail(input.email);
  if (emailResult.error) {
    // Email is fatal — we cannot create a deduplicated record without it.
    return { data: null, errors: [emailResult.error] };
  }

  const phoneResult = normalizePhone(input.phone);
  if (phoneResult.error) errors.push(phoneResult.error);

  return {
    data: {
      email: emailResult.value,
      name: normalizeName(input.name),
      phone: phoneResult.value,
      city: input.city ? String(input.city).trim() : null,
      tags: normalizeTags(input.tags),
    },
    errors,
  };
}

export interface BulkIngestionResult {
  valid: NormalizedCustomer[];
  invalid: Array<{ index: number; input: RawCustomerInput; errors: FieldError[] }>;
}

/**
 * Normalises an array of raw inputs, deduplicates by email within the batch,
 * and separates valid records from invalid ones.
 *
 * The DB layer (INSERT … ON CONFLICT DO NOTHING) handles deduplication against
 * existing rows; this function handles duplicates within the same batch so the
 * second occurrence gets a clear error rather than a confusing DB violation.
 */
export function normalizeBulkCustomers(inputs: RawCustomerInput[]): BulkIngestionResult {
  const valid: NormalizedCustomer[] = [];
  const invalid: BulkIngestionResult['invalid'] = [];
  const seenEmails = new Set<string>();

  inputs.forEach((input, index) => {
    const result = normalizeCustomer(input);

    if (!result.data) {
      invalid.push({ index, input, errors: result.errors });
      return;
    }

    if (seenEmails.has(result.data.email)) {
      invalid.push({
        index,
        input,
        errors: [
          {
            field: 'email',
            message: `Duplicate email "${result.data.email}" within this batch`,
            receivedValue: result.data.email,
          },
        ],
      });
      return;
    }

    seenEmails.add(result.data.email);
    valid.push(result.data);
  });

  return { valid, invalid };
}

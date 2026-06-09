import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes without style conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as Indian Rupees. */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format a large number with K/L/Cr suffix. */
export function formatCompact(n: number): string {
  if (n >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Format a percentage (0.45 → "45.0%"). */
export function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/** Map a SegmentRule field to a human-readable label. */
export function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    total_spend: 'Total Spend',
    order_count: 'Order Count',
    last_purchase_days: 'Days Since Purchase',
    city: 'City',
    tag: 'Tag',
  };
  return labels[field] ?? field;
}

/** Map an operator to a readable symbol. */
export function operatorSymbol(op: string): string {
  const map: Record<string, string> = {
    gte: '≥', lte: '≤', gt: '>', lt: '<',
    eq: '=', neq: '≠', contains: 'contains',
  };
  return map[op] ?? op;
}

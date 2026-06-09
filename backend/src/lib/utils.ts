// ─── Shared pure utility functions ───────────────────────────────────────────

/**
 * Splits an array into sequential chunks of the given size.
 * Used by the campaign fan-out engine to batch DB inserts and channel-service
 * HTTP calls without hitting PostgreSQL's 65535-parameter limit or overwhelming
 * the channel service with too many concurrent requests.
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Replaces {{name}} and {{city}} placeholders in a message template.
 * Case-insensitive so {{Name}} and {{NAME}} both work.
 */
export function interpolateTemplate(
  template: string,
  vars: { name: string; city?: string | null }
): string {
  return template
    .replace(/\{\{name\}\}/gi, vars.name)
    .replace(/\{\{city\}\}/gi, vars.city ?? 'your area');
}

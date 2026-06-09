import type {
  Customer, Order, Segment, Campaign, CampaignAnalytics,
  DashboardStats, PaginatedResponse, AISegmentResult, AIMessageResult,
  SegmentRule, Channel,
} from './types';

// In dev, Vite proxies /api → http://localhost:3001 (see vite.config.ts).
// In production, VITE_API_URL must point to the deployed backend.
const BASE = import.meta.env.VITE_API_URL ?? '';

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string; details?: unknown } };
    const detail = body.error?.details
      ? ` (${JSON.stringify(body.error.details)})`
      : '';
    throw new Error((body.error?.message ?? `HTTP ${res.status}`) + detail);
  }

  return res.json() as Promise<T>;
}

const get = <T>(path: string) => req<T>(path);
const post = <T>(path: string, body: unknown) =>
  req<T>(path, { method: 'POST', body: JSON.stringify(body) });
const del = <T>(path: string) => req<T>(path, { method: 'DELETE' });

// Strip undefined/null so they never appear as literal "undefined" in the query string.
function qs(params?: Record<string, string | number | undefined | null>): string {
  if (!params) return '';
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
  ) as Record<string, string>;
  const s = new URLSearchParams(clean).toString();
  return s ? `?${s}` : '';
}

// ─── API surface ──────────────────────────────────────────────────────────────

export const api = {
  dashboard: {
    stats: () => get<DashboardStats>('/api/dashboard/stats'),
  },

  customers: {
    list: (params?: { page?: number; limit?: number; search?: string; city?: string }) =>
      get<PaginatedResponse<Customer>>(`/api/customers${qs(params)}`),
    create: (data: { email: string; name: string; phone?: string; city?: string; tags?: string[] }) =>
      post<{ customer: Customer; warnings: unknown[] }>('/api/customers', data),
    bulk: (customers: unknown[]) =>
      post<{ inserted: number; failed: number; errors: unknown[] }>('/api/customers/bulk', { customers }),
  },

  orders: {
    byCustomer: (customerId: string, params?: { page?: number; limit?: number }) =>
      get<PaginatedResponse<Order>>(`/api/orders/customer/${customerId}${qs(params)}`),
    create: (data: { customerId: string; totalAmount: number; items?: unknown[] }) =>
      post<Order>('/api/orders', data),
  },

  segments: {
    list: (params?: { page?: number; limit?: number }) =>
      get<PaginatedResponse<Segment>>(`/api/segments${qs(params)}`),
    preview: (rules: SegmentRule[]) =>
      post<{ count: number; sample: Customer[]; compiledSql: string }>('/api/segments/preview', { rules }),
    create: (data: { name: string; description?: string; rules: SegmentRule[] }) =>
      post<Segment>('/api/segments', data),
    delete: (id: string) => del<void>(`/api/segments/${id}`),
  },

  campaigns: {
    list: (params?: { page?: number; limit?: number; status?: string }) =>
      get<PaginatedResponse<Campaign>>(`/api/campaigns${qs(params)}`),
    get: (id: string) => get<Campaign>(`/api/campaigns/${id}`),
    create: (data: {
      name: string;
      channel: Channel;
      messageTemplate: string;
      segmentDefinitionId?: string;
      segmentRules?: SegmentRule[];
    }) => post<Campaign>('/api/campaigns', data),
    launch: (id: string) => post<Campaign & { audienceCount: number }>(`/api/campaigns/${id}/launch`, {}),
    analytics: (id: string) => get<CampaignAnalytics>(`/api/campaigns/${id}/analytics`),
  },

  ai: {
    segment: (prompt: string) =>
      post<AISegmentResult>('/api/ai/segment', { prompt }),
    message: (data: { audienceDescription: string; campaignGoal: string; channel: Channel }) =>
      post<AIMessageResult>('/api/ai/message', data),
  },
};

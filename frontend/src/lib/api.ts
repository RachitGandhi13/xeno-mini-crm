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
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: { message?: string } }).error?.message ??
        `HTTP ${res.status}`
    );
  }

  return res.json() as Promise<T>;
}

const get = <T>(path: string) => req<T>(path);
const post = <T>(path: string, body: unknown) =>
  req<T>(path, { method: 'POST', body: JSON.stringify(body) });
const del = <T>(path: string) => req<T>(path, { method: 'DELETE' });

// ─── API surface ──────────────────────────────────────────────────────────────

export const api = {
  dashboard: {
    stats: () => get<DashboardStats>('/api/dashboard/stats'),
  },

  customers: {
    list: (params?: { page?: number; limit?: number; search?: string; city?: string }) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return get<PaginatedResponse<Customer>>(`/api/customers${q ? `?${q}` : ''}`);
    },
    create: (data: { email: string; name: string; phone?: string; city?: string; tags?: string[] }) =>
      post<{ customer: Customer; warnings: unknown[] }>('/api/customers', data),
    bulk: (customers: unknown[]) =>
      post<{ inserted: number; failed: number; errors: unknown[] }>('/api/customers/bulk', { customers }),
  },

  orders: {
    byCustomer: (customerId: string, params?: { page?: number; limit?: number }) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return get<PaginatedResponse<Order>>(`/api/orders/customer/${customerId}${q ? `?${q}` : ''}`);
    },
    create: (data: { customerId: string; totalAmount: number; items?: unknown[] }) =>
      post<Order>('/api/orders', data),
  },

  segments: {
    list: (params?: { page?: number; limit?: number }) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return get<PaginatedResponse<Segment>>(`/api/segments${q ? `?${q}` : ''}`);
    },
    preview: (rules: SegmentRule[]) =>
      post<{ count: number; sample: Customer[]; compiledSql: string }>('/api/segments/preview', { rules }),
    create: (data: { name: string; description?: string; rules: SegmentRule[] }) =>
      post<Segment>('/api/segments', data),
    delete: (id: string) => del<void>(`/api/segments/${id}`),
  },

  campaigns: {
    list: (params?: { page?: number; limit?: number; status?: string }) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return get<PaginatedResponse<Campaign>>(`/api/campaigns${q ? `?${q}` : ''}`);
    },
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

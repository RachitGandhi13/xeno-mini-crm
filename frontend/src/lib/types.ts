// Shared TypeScript types that mirror the backend's DB schema and API contracts.
// Keep in sync with backend/src/db/schema.ts.

export type Channel = 'whatsapp' | 'sms' | 'email' | 'rcs';
export type CampaignStatus = 'draft' | 'running' | 'completed' | 'failed';
export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'failed';
export type SegmentRuleField = 'total_spend' | 'order_count' | 'last_purchase_days' | 'city' | 'tag';
export type SegmentOperator = 'gte' | 'lte' | 'gt' | 'lt' | 'eq' | 'neq' | 'contains';

export interface SegmentRule {
  field: SegmentRuleField;
  operator: SegmentOperator;
  value: string | number;
}

export interface Customer {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  city: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  customerId: string;
  totalAmount: string;
  items: Array<{ name: string; quantity: number; unitPrice: number }> | null;
  attributedCampaignId: string | null;
  createdAt: string;
}

export interface Segment {
  id: string;
  name: string;
  description: string | null;
  rules: SegmentRule[];
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  channel: Channel;
  status: CampaignStatus;
  segmentDefinitionId: string | null;
  segmentRulesSnapshot: SegmentRule[] | null;
  messageTemplate: string;
  totalAudienceCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CampaignAnalytics {
  campaign: Campaign;
  funnel: {
    total: number;
    queued: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    failed: number;
  };
  rates: {
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    failureRate: number;
  };
  conversions: {
    count: number;
    revenue: number;
  };
}

export interface DashboardStats {
  totalCustomers: number;
  totalCampaigns: number;
  activeCampaigns: number;
  attributedRevenue: number;
  monthlyConversions: number;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}

// ─── AI endpoint types ────────────────────────────────────────────────────────

export interface AISegmentResult {
  rules: SegmentRule[];
  segmentName: string;
  explanation: string;
  audienceCount: number;
  sample: Array<{ id: string; name: string; email: string; city: string | null }>;
  compiledSql: string;
}

export interface AIMessageResult {
  template: string;
  subject?: string;
  explanation: string;
}

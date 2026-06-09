import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact } from '@/lib/utils';
import type { Campaign, CampaignStatus } from '@/lib/types';

const STATUS_VARIANT: Record<CampaignStatus, 'success' | 'warning' | 'destructive' | 'outline'> = {
  completed: 'success',
  running:   'warning',
  failed:    'destructive',
  draft:     'outline',
};

const inputCls =
  'w-full rounded-xl border border-[#C0CFC0]/50 bg-white/60 px-3 py-1.5 text-sm text-[#1C1E1C] placeholder:text-[#4A504A]/40 focus:outline-none focus:ring-2 focus:ring-[#6E7A6E]/50 transition-all duration-300';

function AnalyticsRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between text-sm py-2 border-b border-[#E8E5E0] last:border-0">
      <span className="text-[#4A504A]/70">{label}</span>
      <span className="font-medium text-[#1C1E1C]">{value}</span>
    </div>
  );
}

function CampaignAnalyticsPanel({ campaignId }: { campaignId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', campaignId, 'analytics'],
    queryFn: () => api.campaigns.analytics(campaignId),
  });

  if (isLoading) return (
    <div className="p-4 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full rounded-lg" />)}
    </div>
  );
  if (!data) return null;

  const { funnel, rates, conversions } = data;
  return (
    <div className="px-4 pb-4 pt-1 bg-[#F4F4F3]/60 rounded-b-2xl">
      <p className="text-xs font-semibold text-[#4A504A]/50 uppercase tracking-wide mb-2">Analytics</p>
      <AnalyticsRow label="Sent" value={funnel.sent} />
      <AnalyticsRow label="Delivered" value={`${funnel.delivered} (${(rates.deliveryRate * 100).toFixed(1)}%)`} />
      <AnalyticsRow label="Opened" value={`${funnel.opened} (${(rates.openRate * 100).toFixed(1)}%)`} />
      <AnalyticsRow label="Clicked" value={`${funnel.clicked} (${(rates.clickRate * 100).toFixed(1)}%)`} />
      <AnalyticsRow label="Converted" value={conversions.count} />
      <AnalyticsRow label="Failed" value={`${funnel.failed} (${(rates.failureRate * 100).toFixed(1)}%)`} />
    </div>
  );
}

function CampaignCard({ c }: { c: Campaign }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const launchMutation = useMutation({
    mutationFn: () => api.campaigns.launch(c.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  return (
    <Card className="overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgb(0,0,0,0.07)]">
      <CardContent className="p-0">
        <div
          className="flex items-center justify-between p-4 sm:p-5 cursor-pointer hover:bg-[#C0CFC0]/10 transition-all duration-300"
          onClick={() => setExpanded((p) => !p)}
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[#1C1E1C] truncate">{c.name}</p>
            <p className="text-xs text-[#4A504A]/60 mt-0.5 capitalize">
              {c.channel} · {formatCompact(c.totalAudienceCount)} recipients
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 ml-3 shrink-0">
            {c.status === 'draft' && (
              <Button
                size="sm"
                disabled={launchMutation.isPending}
                onClick={(e) => { e.stopPropagation(); launchMutation.mutate(); }}
              >
                {launchMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Launch'}
              </Button>
            )}
            <Badge variant={STATUS_VARIANT[c.status]} className="capitalize hidden sm:inline-flex">{c.status}</Badge>
            {expanded
              ? <ChevronUp className="h-4 w-4 text-[#4A504A]/40" />
              : <ChevronDown className="h-4 w-4 text-[#4A504A]/40" />}
          </div>
        </div>
        {launchMutation.error && (
          <p className="px-5 pb-3 text-xs text-red-500">{(launchMutation.error as Error).message}</p>
        )}
        {/* Animated expand */}
        <div className={`overflow-hidden transition-all duration-300 ease-out ${expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
          {expanded && <CampaignAnalyticsPanel campaignId={c.id} />}
        </div>
      </CardContent>
    </Card>
  );
}

function CreateCampaignForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', channel: 'whatsapp', messageTemplate: '' });
  const [segmentId, setSegmentId] = useState('');

  const { data: segments } = useQuery({
    queryKey: ['segments', 'all'],
    queryFn: () => api.segments.list({ limit: 100 }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.campaigns.create({
        name: form.name,
        channel: form.channel as any,
        messageTemplate: form.messageTemplate,
        segmentDefinitionId: segmentId || undefined,
        segmentRules: segmentId ? undefined : [{ field: 'order_count', operator: 'gte', value: 0 }],
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); onClose(); },
  });

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <p className="font-semibold text-[#1C1E1C]">New Campaign</p>

        <div className="space-y-1">
          <label className="text-xs text-[#4A504A]">Campaign Name</label>
          <input className={inputCls} placeholder="Summer Re-engagement" value={form.name} onChange={set('name')} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-[#4A504A]">Channel</label>
            <select className={inputCls} value={form.channel} onChange={set('channel')}>
              {['whatsapp', 'sms', 'email', 'rcs'].map((ch) => (
                <option key={ch} value={ch}>{ch.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[#4A504A]">Segment (optional)</label>
            <select className={inputCls} value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
              <option value="">All customers</option>
              {segments?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-[#4A504A]">Message Template</label>
          <textarea
            rows={3}
            className={`${inputCls} resize-none`}
            placeholder="Hi {{name}}, …"
            value={form.messageTemplate}
            onChange={set('messageTemplate')}
          />
        </div>

        {mutation.error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{(mutation.error as Error).message}</p>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1"
            disabled={!form.name.trim() || !form.messageTemplate.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Creating…</> : 'Create'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CampaignsPage() {
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<string>('');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['campaigns', status],
    queryFn: () => api.campaigns.list({ status: status || undefined, limit: 20 }),
    refetchInterval: 10_000,
  });

  const filters = ['', 'draft', 'running', 'completed', 'failed'];

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#1C1E1C]">Campaigns</h1>
          <p className="text-sm text-[#4A504A]/70 mt-0.5">Manage and monitor your messaging campaigns</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-xl p-2 text-[#4A504A]/40 hover:text-[#4A504A] hover:bg-[#C0CFC0]/30 transition-all duration-300"
            onClick={() => refetch()}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New Campaign
          </Button>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {filters.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={[
              'rounded-full px-3 py-1 text-xs font-medium transition-all duration-300',
              status === s
                ? 'bg-[#586358] text-[#F4F4F3] shadow-sm'
                : 'bg-[#C0CFC0]/25 text-[#4A504A] hover:bg-[#C0CFC0]/50',
            ].join(' ')}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {creating && <CreateCampaignForm onClose={() => setCreating(false)} />}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
        </div>
      ) : !data?.data.length ? (
        <div className="rounded-2xl border-2 border-dashed border-[#C0CFC0]/50 py-14 text-center">
          <p className="text-sm text-[#4A504A]/60">
            No campaigns {status && `with status "${status}"`} yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.data.map((c) => <CampaignCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}

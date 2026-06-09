import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, RefreshCw } from 'lucide-react';
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

// ─── Analytics drawer ─────────────────────────────────────────────────────────

function AnalyticsRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between text-sm py-1 border-b border-slate-100 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

function CampaignAnalyticsPanel({ campaignId }: { campaignId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', campaignId, 'analytics'],
    queryFn: () => api.campaigns.analytics(campaignId),
  });

  if (isLoading) return <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>;
  if (!data) return null;

  const { funnel, rates, conversions } = data;
  return (
    <div className="p-4 bg-slate-50 rounded-b-xl">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Analytics</p>
      <AnalyticsRow label="Sent" value={funnel.sent} />
      <AnalyticsRow label="Delivered" value={`${funnel.delivered} (${(rates.deliveryRate * 100).toFixed(1)}%)`} />
      <AnalyticsRow label="Opened" value={`${funnel.opened} (${(rates.openRate * 100).toFixed(1)}%)`} />
      <AnalyticsRow label="Clicked" value={`${funnel.clicked} (${(rates.clickRate * 100).toFixed(1)}%)`} />
      <AnalyticsRow label="Converted" value={conversions.count} />
      <AnalyticsRow label="Failed" value={`${funnel.failed} (${(rates.failureRate * 100).toFixed(1)}%)`} />
    </div>
  );
}

// ─── Campaign card ─────────────────────────────────────────────────────────────

function CampaignCard({ c }: { c: Campaign }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const launchMutation = useMutation({
    mutationFn: () => api.campaigns.launch(c.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  return (
    <Card>
      <CardContent className="p-0">
        <div
          className="flex items-center justify-between p-4 cursor-pointer"
          onClick={() => setExpanded((p) => !p)}
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-800 truncate">{c.name}</p>
            <p className="text-xs text-slate-400 mt-0.5 capitalize">{c.channel} · {formatCompact(c.totalAudienceCount)} recipients</p>
          </div>
          <div className="flex items-center gap-3 ml-4 shrink-0">
            {c.status === 'draft' && (
              <Button
                size="sm"
                disabled={launchMutation.isPending}
                onClick={(e) => { e.stopPropagation(); launchMutation.mutate(); }}
              >
                {launchMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Launch'}
              </Button>
            )}
            <Badge variant={STATUS_VARIANT[c.status]} className="capitalize">{c.status}</Badge>
          </div>
        </div>
        {expanded && <CampaignAnalyticsPanel campaignId={c.id} />}
      </CardContent>
    </Card>
  );
}

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateCampaignForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', channel: 'whatsapp', messageTemplate: '' });

  const { data: segments } = useQuery({
    queryKey: ['segments', 'all'],
    queryFn: () => api.segments.list({ limit: 100 }),
  });

  const [segmentId, setSegmentId] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.campaigns.create({
        name: form.name,
        channel: form.channel as any,
        messageTemplate: form.messageTemplate,
        segmentDefinitionId: segmentId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
    },
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <p className="font-semibold text-slate-800">New Campaign</p>

        <div className="space-y-1">
          <label className="text-xs text-slate-500">Name</label>
          <input className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Summer Re-engagement" value={form.name} onChange={set('name')} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Channel</label>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.channel} onChange={set('channel')}>
              {['whatsapp', 'sms', 'email', 'rcs'].map((ch) => (
                <option key={ch} value={ch}>{ch.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Segment (optional)</label>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
              <option value="">All customers</option>
              {segments?.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-500">Message Template</label>
          <textarea rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Hi {{name}}, ..."
            value={form.messageTemplate} onChange={set('messageTemplate')} />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1"
            disabled={!form.name.trim() || !form.messageTemplate.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Creating…</> : 'Create Campaign'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState<string>('');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['campaigns', status],
    queryFn: () => api.campaigns.list({ status: status || undefined, limit: 20 }),
    refetchInterval: 10_000,
  });

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Campaigns</h1>
          <p className="text-sm text-slate-500">Manage and monitor your messaging campaigns</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            onClick={() => refetch()}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New Campaign
          </Button>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {['', 'draft', 'running', 'completed', 'failed'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              status === s
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {creating && <CreateCampaignForm onClose={() => setCreating(false)} />}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : !data?.data.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
          <p className="text-slate-400 text-sm">No campaigns {status && `with status "${status}"`} yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.data.map((c) => <CampaignCard key={c.id} c={c} />)}
        </div>
      )}
    </div>
  );
}

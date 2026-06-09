import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Trash2, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fieldLabel, operatorSymbol, formatCompact } from '@/lib/utils';
import type { Segment, SegmentRule, SegmentRuleField, SegmentOperator } from '@/lib/types';

const FIELDS: SegmentRuleField[] = ['total_spend', 'order_count', 'last_purchase_days', 'city', 'tag'];
const OPERATORS: SegmentOperator[] = ['gte', 'lte', 'gt', 'lt', 'eq', 'neq', 'contains'];

const selectCls =
  'rounded-xl border border-[#C0CFC0]/50 bg-white/70 px-2.5 py-1.5 text-sm text-[#1C1E1C] focus:outline-none focus:ring-2 focus:ring-[#6E7A6E]/50 transition-all duration-300';

function RuleBuilderRow({ rule, onChange, onRemove }: {
  rule: SegmentRule;
  onChange: (r: SegmentRule) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
      <select className={selectCls} value={rule.field} onChange={(e) => onChange({ ...rule, field: e.target.value as SegmentRuleField })}>
        {FIELDS.map((f) => <option key={f} value={f}>{fieldLabel(f)}</option>)}
      </select>
      <select className={selectCls} value={rule.operator} onChange={(e) => onChange({ ...rule, operator: e.target.value as SegmentOperator })}>
        {OPERATORS.map((o) => <option key={o} value={o}>{operatorSymbol(o)}</option>)}
      </select>
      <input
        className={`${selectCls} flex-1 min-w-0`}
        value={String(rule.value)}
        placeholder="value"
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
      />
      <button onClick={onRemove} className="text-[#4A504A]/30 hover:text-red-500 transition-all duration-300 shrink-0">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function CreateSegmentForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [rules, setRules] = useState<SegmentRule[]>([{ field: 'total_spend', operator: 'gte', value: 1000 }]);
  const [preview, setPreview] = useState<{ count: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.segments.create({ name: name.trim(), rules }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['segments'] }); onClose(); },
  });

  async function runPreview() {
    setPreviewing(true);
    try {
      const res = await api.segments.preview(rules);
      setPreview({ count: res.count });
    } finally { setPreviewing(false); }
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <p className="font-semibold text-[#1C1E1C]">New Segment</p>
        <div className="space-y-1">
          <label className="text-xs text-[#4A504A]">Segment Name</label>
          <input
            className="w-full rounded-xl border border-[#C0CFC0]/50 bg-white/60 px-3 py-1.5 text-sm text-[#1C1E1C] placeholder:text-[#4A504A]/40 focus:outline-none focus:ring-2 focus:ring-[#6E7A6E]/50 transition-all duration-300"
            placeholder="High-value Mumbai customers"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs text-[#4A504A]">Rules — all conditions must match</p>
          {rules.map((r, i) => (
            <RuleBuilderRow
              key={i} rule={r}
              onChange={(u) => setRules((p) => p.map((old, idx) => idx === i ? u : old))}
              onRemove={() => setRules((p) => p.filter((_, idx) => idx !== i))}
            />
          ))}
          <Button variant="outline" size="sm"
            onClick={() => setRules((p) => [...p, { field: 'order_count', operator: 'gte', value: 1 }])}>
            + Add Rule
          </Button>
        </div>

        {preview && (
          <div className="rounded-2xl bg-[#C0CFC0]/25 border border-[#C0CFC0]/40 px-4 py-3 text-sm text-[#3A5A3A]">
            Estimated audience: <strong>{formatCompact(preview.count)}</strong> customers
          </div>
        )}
        {mutation.error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{(mutation.error as Error).message}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="flex-1 min-w-[80px]" onClick={onClose}>Cancel</Button>
          <Button variant="outline" className="flex-1 min-w-[80px]" disabled={!rules.length || previewing} onClick={runPreview}>
            {previewing ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Previewing…</> : <><Eye className="mr-1.5 h-3.5 w-3.5" />Preview</>}
          </Button>
          <Button className="flex-1 min-w-[80px]" disabled={!name.trim() || !rules.length || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</> : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SegmentCard({ s }: { s: Segment }) {
  const qc = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => api.segments.delete(s.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['segments'] }),
  });

  return (
    <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgb(0,0,0,0.07)]">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[#1C1E1C]">{s.name}</p>
            {s.description && <p className="text-xs text-[#4A504A]/60 mt-0.5">{s.description}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {s.rules.map((r, i) => (
                <span key={i} className="rounded-full border border-[#C0CFC0] bg-[#C0CFC0]/25 px-2.5 py-0.5 text-xs text-[#3A5A3A]">
                  {fieldLabel(r.field)} {operatorSymbol(r.operator)} {r.value}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="text-[#4A504A]/25 hover:text-red-500 transition-all duration-300 shrink-0 mt-0.5"
          >
            {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SegmentsPage() {
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['segments'],
    queryFn: () => api.segments.list({ limit: 50 }),
  });

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#1C1E1C]">Segments</h1>
          <p className="text-sm text-[#4A504A]/70 mt-0.5">Define reusable audience rules for campaigns</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New Segment
        </Button>
      </div>

      {creating && <CreateSegmentForm onClose={() => setCreating(false)} />}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
      ) : !data?.data.length ? (
        <div className="rounded-2xl border-2 border-dashed border-[#C0CFC0]/50 py-14 text-center">
          <p className="text-sm text-[#4A504A]/60">No segments yet.</p>
          <p className="text-xs text-[#4A504A]/40 mt-1">Create one above to target specific customers.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.data.map((s) => <SegmentCard key={s.id} s={s} />)}
        </div>
      )}
    </div>
  );
}

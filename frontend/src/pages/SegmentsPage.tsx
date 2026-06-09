import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Trash2, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fieldLabel, operatorSymbol, formatCompact } from '@/lib/utils';
import type { Segment, SegmentRule, SegmentRuleField, SegmentOperator } from '@/lib/types';

// ─── Rule builder row ─────────────────────────────────────────────────────────

const FIELDS: SegmentRuleField[] = ['total_spend', 'order_count', 'last_purchase_days', 'city', 'tag'];
const OPERATORS: SegmentOperator[] = ['gte', 'lte', 'gt', 'lt', 'eq', 'neq', 'contains'];

function RuleBuilderRow({
  rule,
  onChange,
  onRemove,
}: {
  rule: SegmentRule;
  onChange: (r: SegmentRule) => void;
  onRemove: () => void;
}) {
  const cls = "rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
  return (
    <div className="flex items-center gap-2">
      <select className={cls} value={rule.field} onChange={(e) => onChange({ ...rule, field: e.target.value as SegmentRuleField })}>
        {FIELDS.map((f) => <option key={f} value={f}>{fieldLabel(f)}</option>)}
      </select>
      <select className={cls} value={rule.operator} onChange={(e) => onChange({ ...rule, operator: e.target.value as SegmentOperator })}>
        {OPERATORS.map((o) => <option key={o} value={o}>{operatorSymbol(o)}</option>)}
      </select>
      <input
        className={`${cls} flex-1`}
        value={String(rule.value)}
        placeholder="value"
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
      />
      <button onClick={onRemove} className="text-slate-400 hover:text-red-500 transition-colors">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateSegmentForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [rules, setRules] = useState<SegmentRule[]>([
    { field: 'total_spend', operator: 'gte', value: 1000 },
  ]);
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
    } finally {
      setPreviewing(false);
    }
  }

  const updateRule = (i: number, r: SegmentRule) =>
    setRules((prev) => prev.map((old, idx) => (idx === i ? r : old)));

  const removeRule = (i: number) =>
    setRules((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <p className="font-semibold text-slate-800">New Segment</p>

        <div className="space-y-1">
          <label className="text-xs text-slate-500">Segment Name</label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="High-value Mumbai customers"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs text-slate-500">Rules (all conditions must match)</p>
          {rules.map((r, i) => (
            <RuleBuilderRow
              key={i}
              rule={r}
              onChange={(updated) => updateRule(i, updated)}
              onRemove={() => removeRule(i)}
            />
          ))}
          <Button
            variant="outline" size="sm"
            onClick={() => setRules((p) => [...p, { field: 'order_count', operator: 'gte', value: 1 }])}
          >
            + Add Rule
          </Button>
        </div>

        {preview && (
          <div className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
            Estimated audience: <strong>{formatCompact(preview.count)}</strong> customers
          </div>
        )}

        {mutation.error && (
          <p className="text-xs text-red-500">{(mutation.error as Error).message}</p>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            variant="outline" className="flex-1"
            disabled={!rules.length || previewing}
            onClick={runPreview}
          >
            {previewing ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Previewing…</> : <><Eye className="mr-1.5 h-3.5 w-3.5" />Preview</>}
          </Button>
          <Button
            className="flex-1"
            disabled={!name.trim() || !rules.length || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</> : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Segment card ─────────────────────────────────────────────────────────────

function SegmentCard({ s }: { s: Segment }) {
  const qc = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => api.segments.delete(s.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['segments'] }),
  });

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-800">{s.name}</p>
            {s.description && <p className="text-xs text-slate-400 mt-0.5">{s.description}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {s.rules.map((r, i) => (
                <span key={i} className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs text-indigo-800">
                  {fieldLabel(r.field)} {operatorSymbol(r.operator)} {r.value}
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            className="ml-4 text-slate-300 hover:text-red-500 transition-colors shrink-0"
          >
            {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SegmentsPage() {
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['segments'],
    queryFn: () => api.segments.list({ limit: 50 }),
  });

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Segments</h1>
          <p className="text-sm text-slate-500">Define reusable audience rules for campaigns</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New Segment
        </Button>
      </div>

      {creating && <CreateSegmentForm onClose={() => setCreating(false)} />}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : !data?.data.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center">
          <p className="text-sm text-slate-400">No segments yet.</p>
          <p className="text-xs text-slate-400 mt-1">Use the AI Copilot on the Dashboard to auto-generate one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.data.map((s) => <SegmentCard key={s.id} s={s} />)}
        </div>
      )}
    </div>
  );
}

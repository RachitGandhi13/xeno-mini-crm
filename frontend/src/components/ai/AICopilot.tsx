import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, Loader2, Sparkles, Users, ChevronRight, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fieldLabel, operatorSymbol, formatCompact } from '@/lib/utils';
import type { AISegmentResult, AIMessageResult, SegmentRule } from '@/lib/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase =
  | { kind: 'idle' }
  | { kind: 'segment_loading' }
  | { kind: 'segment_ready'; result: AISegmentResult }
  | { kind: 'campaign_form'; result: AISegmentResult; msgLoading: boolean; msgResult: AIMessageResult | null }
  | { kind: 'saving_segment'; result: AISegmentResult }
  | { kind: 'done'; message: string };

// ─── Rule chip ────────────────────────────────────────────────────────────────

function RuleChip({ rule }: { rule: SegmentRule }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
      {fieldLabel(rule.field)} {operatorSymbol(rule.operator)} {rule.value}
    </span>
  );
}

// ─── Campaign creation form ───────────────────────────────────────────────────

interface CampaignFormProps {
  result: AISegmentResult;
  msgLoading: boolean;
  msgResult: AIMessageResult | null;
  onLaunch: (name: string, channel: string, template: string) => void;
  onBack: () => void;
}

function CampaignForm({ result, msgLoading, msgResult, onLaunch, onBack }: CampaignFormProps) {
  const [name, setName] = useState(result.segmentName + ' Campaign');
  const [channel, setChannel] = useState('whatsapp');
  const [template, setTemplate] = useState(msgResult?.template ?? '');

  useEffect(() => {
    if (msgResult?.template) setTemplate(msgResult.template);
  }, [msgResult]);

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Create Campaign</p>

      <div className="space-y-2">
        <label className="block text-xs text-slate-500">Campaign Name</label>
        <input
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-slate-500">Channel</label>
        <select
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
        >
          {['whatsapp', 'sms', 'email', 'rcs'].map((ch) => (
            <option key={ch} value={ch}>{ch.toUpperCase()}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-slate-500">Message Template</label>
        {msgLoading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <textarea
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Hi {{name}}, ..."
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          />
        )}
        {msgResult?.explanation && (
          <p className="text-xs text-slate-400 italic">{msgResult.explanation}</p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled={!name.trim() || !template.trim() || msgLoading}
          onClick={() => onLaunch(name.trim(), channel, template.trim())}
        >
          Launch Campaign
        </Button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AICopilot() {
  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const segmentMutation = useMutation({
    mutationFn: (p: string) => api.ai.segment(p),
    onMutate: () => setPhase({ kind: 'segment_loading' }),
    onSuccess: (result) => setPhase({ kind: 'segment_ready', result }),
    onError: (err) =>
      setPhase({
        kind: 'done',
        message: `Error: ${err instanceof Error ? err.message : 'AI service unavailable'}`,
      }),
  });

  const msgMutation = useMutation({
    mutationFn: (p: { segmentName: string; rules: SegmentRule[]; channel: string }) =>
      api.ai.message({
        audienceDescription: p.segmentName,
        campaignGoal: `Re-engage ${p.segmentName} customers via ${p.channel}`,
        channel: p.channel as import('@/lib/types').Channel,
      }),
  });

  const saveSegmentMutation = useMutation({
    mutationFn: (result: AISegmentResult) =>
      api.segments.create({ name: result.segmentName, rules: result.rules }),
    onSuccess: () =>
      setPhase({ kind: 'done', message: 'Segment saved! You can find it on the Segments page.' }),
    onError: () =>
      setPhase({ kind: 'done', message: 'Failed to save segment. Please try again.' }),
  });

  const campaignMutation = useMutation({
    mutationFn: async (p: {
      name: string; channel: string; template: string; segmentId: string;
    }) => {
      const campaign = await api.campaigns.create({
        name: p.name,
        channel: p.channel as import('@/lib/types').Channel,
        messageTemplate: p.template,
        segmentDefinitionId: p.segmentId,
      });
      await api.campaigns.launch(campaign.id);
      return campaign;
    },
    onSuccess: (c) =>
      setPhase({
        kind: 'done',
        message: `Campaign "${c.name}" is running! Check the Campaigns page for live analytics.`,
      }),
    onError: () =>
      setPhase({ kind: 'done', message: 'Failed to create campaign. Please try again.' }),
  });

  function submit() {
    const p = prompt.trim();
    if (!p) return;
    setPrompt('');
    segmentMutation.mutate(p);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function handleCreateCampaign(result: AISegmentResult) {
    setPhase({ kind: 'campaign_form', result, msgLoading: true, msgResult: null });
    try {
      const msgResult = await msgMutation.mutateAsync({
        segmentName: result.segmentName,
        rules: result.rules,
        channel: 'whatsapp',
      });
      setPhase((prev) =>
        prev.kind === 'campaign_form'
          ? { ...prev, msgLoading: false, msgResult }
          : prev
      );
    } catch {
      setPhase((prev) =>
        prev.kind === 'campaign_form' ? { ...prev, msgLoading: false } : prev
      );
    }
  }

  async function handleLaunch(name: string, channel: string, template: string) {
    if (phase.kind !== 'campaign_form') return;
    const { result } = phase;

    // Save segment first to get an ID, then create campaign
    const segment = await api.segments.create({ name: result.segmentName, rules: result.rules });
    campaignMutation.mutate({ name, channel, template, segmentId: segment.id });
  }

  function reset() {
    setPhase({ kind: 'idle' });
    setPrompt('');
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  return (
    <Card className="flex flex-col h-full min-h-0">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          AI Copilot
        </CardTitle>
        <p className="text-xs text-slate-400">Describe your audience in plain English</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 flex-1 min-h-0">
        {/* Result area */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {phase.kind === 'idle' && (
            <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center">
              <Sparkles className="mx-auto mb-2 h-8 w-8 text-indigo-200" />
              <p className="text-sm text-slate-500">
                Try: <span className="italic text-slate-400">"high spenders who haven't bought in 60 days"</span>
              </p>
              <p className="mt-1 text-xs text-slate-400">
                The AI will build a live audience segment from your data.
              </p>
            </div>
          )}

          {phase.kind === 'segment_loading' && (
            <div className="space-y-2.5">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-28 rounded-full" />
              </div>
            </div>
          )}

          {phase.kind === 'segment_ready' && (
            <div className="space-y-3">
              {/* Header */}
              <div>
                <p className="font-semibold text-slate-800">{phase.result.segmentName}</p>
                <p className="text-xs text-slate-500 mt-0.5">{phase.result.explanation}</p>
              </div>

              {/* Rules */}
              <div className="flex flex-wrap gap-1.5">
                {phase.result.rules.map((r, i) => (
                  <RuleChip key={i} rule={r} />
                ))}
              </div>

              {/* Audience count */}
              <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2">
                <Users className="h-4 w-4 text-indigo-600 shrink-0" />
                <span className="text-sm font-medium text-indigo-800">
                  {formatCompact(phase.result.audienceCount)} matching customers
                </span>
              </div>

              {/* Sample names */}
              {phase.result.sample.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Sample audience</p>
                  <div className="flex flex-wrap gap-1.5">
                    {phase.result.sample.slice(0, 5).map((s) => (
                      <span
                        key={s.id}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      >
                        {s.name}
                      </span>
                    ))}
                    {phase.result.audienceCount > 5 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                        +{formatCompact(phase.result.audienceCount - 5)} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* CTAs */}
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={saveSegmentMutation.isPending}
                  onClick={() => saveSegmentMutation.mutate(phase.result)}
                >
                  {saveSegmentMutation.isPending ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</>
                  ) : 'Save Segment'}
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => handleCreateCampaign(phase.result)}
                >
                  Create Campaign <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Reset */}
              <button onClick={reset} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
                <X className="h-3 w-3" /> Start over
              </button>
            </div>
          )}

          {phase.kind === 'campaign_form' && (
            <CampaignForm
              result={phase.result}
              msgLoading={phase.msgLoading}
              msgResult={phase.msgResult}
              onLaunch={handleLaunch}
              onBack={() => setPhase({ kind: 'segment_ready', result: phase.result })}
            />
          )}

          {phase.kind === 'done' && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
              <p className="text-sm text-emerald-800">{phase.message}</p>
              <button onClick={reset} className="mt-2 text-xs text-emerald-600 hover:text-emerald-800 underline">
                Start a new query
              </button>
            </div>
          )}
        </div>

        {/* Input row — hidden once a campaign form is open */}
        {phase.kind !== 'campaign_form' && phase.kind !== 'done' && (
          <div className="shrink-0 flex gap-2">
            <textarea
              ref={textareaRef}
              rows={2}
              className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. customers who spent over ₹10,000 in the last month…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={phase.kind === 'segment_loading'}
            />
            <Button
              size="icon"
              className="self-end h-9 w-9"
              disabled={!prompt.trim() || phase.kind === 'segment_loading'}
              onClick={submit}
            >
              {phase.kind === 'segment_loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

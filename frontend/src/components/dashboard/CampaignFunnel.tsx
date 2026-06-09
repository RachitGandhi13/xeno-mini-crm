import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPct } from '@/lib/utils';
import type { CampaignAnalytics } from '@/lib/types';

const FUNNEL_COLORS = ['#6366f1', '#818cf8', '#a5b4fc', '#10b981', '#f59e0b'];

interface Props {
  analytics: CampaignAnalytics | undefined;
  loading: boolean;
}

export default function CampaignFunnel({ analytics, loading }: Props) {
  if (loading) {
    return (
      <Card className="h-72">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-44 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card className="flex h-72 items-center justify-center">
        <p className="text-sm text-slate-400">No campaign data yet — launch a campaign to see analytics.</p>
      </Card>
    );
  }

  const { funnel, rates, conversions, campaign } = analytics;
  const data = [
    { stage: 'Sent',      count: funnel.sent },
    { stage: 'Delivered', count: funnel.delivered },
    { stage: 'Opened',    count: funnel.opened },
    { stage: 'Clicked',   count: funnel.clicked },
    { stage: 'Converted', count: conversions.count },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Delivery Funnel</CardTitle>
        <p className="text-xs text-slate-500 truncate">{campaign.name}</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', borderRadius: 8 }}
              cursor={{ fill: '#f8fafc' }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={FUNNEL_COLORS[i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Rate chips */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {[
            { label: 'Delivery', rate: rates.deliveryRate },
            { label: 'Open',     rate: rates.openRate },
            { label: 'Click',    rate: rates.clickRate },
            { label: 'Failure',  rate: rates.failureRate },
          ].map(({ label, rate }) => (
            <div key={label} className="flex justify-between rounded-md bg-slate-50 px-2.5 py-1.5">
              <span className="text-slate-500">{label}</span>
              <span className="font-medium text-slate-700">{formatPct(rate)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

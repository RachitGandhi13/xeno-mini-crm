import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPct } from '@/lib/utils';
import type { CampaignAnalytics } from '@/lib/types';

// Sage → olive → terracotta palette
const FUNNEL_COLORS = ['#6E7A6E', '#8FA08F', '#C0CFC0', '#DDA28F', '#E5CEC6'];

interface Props {
  analytics: CampaignAnalytics | undefined;
  loading: boolean;
}

export default function CampaignFunnel({ analytics, loading }: Props) {
  if (loading) {
    return (
      <Card className="h-72">
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-44 w-full rounded-xl" /></CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card className="flex h-72 items-center justify-center">
        <p className="text-sm text-[#4A504A]/60 px-6 text-center">
          No campaign data yet — launch a campaign to see the delivery funnel.
        </p>
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
        <p className="text-xs text-[#4A504A]/70 truncate">{campaign.name}</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E8E4" />
            <XAxis
              dataKey="stage"
              tick={{ fontSize: 11, fill: '#8A9A8A' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#8A9A8A' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                border: 'none',
                boxShadow: '0 8px 30px rgb(0,0,0,0.08)',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(8px)',
              }}
              cursor={{ fill: '#F0EDE8' }}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={FUNNEL_COLORS[i]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Rate chips */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {[
            { label: 'Delivery', rate: rates.deliveryRate, color: 'bg-[#C0CFC0]/30 text-[#3A5A3A]' },
            { label: 'Open',     rate: rates.openRate,     color: 'bg-[#C0CFC0]/30 text-[#3A5A3A]' },
            { label: 'Click',    rate: rates.clickRate,    color: 'bg-[#E5CEC6]/50 text-[#8B5E52]' },
            { label: 'Failure',  rate: rates.failureRate,  color: 'bg-red-50 text-red-600' },
          ].map(({ label, rate, color }) => (
            <div key={label} className={`flex justify-between rounded-xl px-2.5 py-1.5 ${color}`}>
              <span className="opacity-70">{label}</span>
              <span className="font-semibold">{formatPct(rate)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

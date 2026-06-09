import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompact } from '@/lib/utils';
import type { Campaign, CampaignStatus } from '@/lib/types';

const STATUS_VARIANT: Record<CampaignStatus, 'success' | 'warning' | 'destructive' | 'outline'> = {
  completed: 'success',
  running:   'warning',
  failed:    'destructive',
  draft:     'outline',
};

function CampaignRow({ c }: { c: Campaign }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
        <p className="text-xs text-slate-400 capitalize">{c.channel}</p>
      </div>
      <div className="ml-4 flex items-center gap-3 shrink-0">
        <span className="text-xs text-slate-500">{formatCompact(c.totalAudienceCount)} rcvr</span>
        <Badge variant={STATUS_VARIANT[c.status]} className="capitalize text-xs">{c.status}</Badge>
      </div>
    </div>
  );
}

export default function RecentCampaigns() {
  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', 'recent'],
    queryFn: () => api.campaigns.list({ page: 1, limit: 6 }),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Recent Campaigns</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No campaigns yet — create one to get started.
          </p>
        ) : (
          <div>
            {data.data.map((c) => (
              <CampaignRow key={c.id} c={c} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

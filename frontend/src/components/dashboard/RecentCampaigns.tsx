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
    <div className="flex items-center justify-between py-3 border-b border-[#E8E5E0] last:border-0 transition-all duration-300 hover:bg-[#C0CFC0]/10 rounded-xl px-2 -mx-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#1C1E1C]">{c.name}</p>
        <p className="text-xs text-[#4A504A]/60 capitalize mt-0.5">{c.channel} · {formatCompact(c.totalAudienceCount)} recipients</p>
      </div>
      <div className="ml-4 shrink-0">
        <Badge variant={STATUS_VARIANT[c.status]} className="capitalize">{c.status}</Badge>
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
              <Skeleton key={i} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <p className="py-8 text-center text-sm text-[#4A504A]/50">
            No campaigns yet — create one to get started.
          </p>
        ) : (
          <div>
            {data.data.map((c) => <CampaignRow key={c.id} c={c} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

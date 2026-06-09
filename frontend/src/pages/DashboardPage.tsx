import { useQuery } from '@tanstack/react-query';
import { Users, Megaphone, Activity, TrendingUp, ShoppingCart } from 'lucide-react';
import { api } from '@/lib/api';
import StatsCard from '@/components/dashboard/StatsCard';
import CampaignFunnel from '@/components/dashboard/CampaignFunnel';
import RecentCampaigns from '@/components/dashboard/RecentCampaigns';
import AICopilot from '@/components/ai/AICopilot';
import { formatINR, formatCompact } from '@/lib/utils';

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: api.dashboard.stats,
    refetchInterval: 30_000,
  });

  // Show funnel for the most recently completed campaign
  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns', 'completed'],
    queryFn: () => api.campaigns.list({ status: 'completed', limit: 1 }),
  });

  const latestCampaignId = campaigns?.data[0]?.id;

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['campaigns', latestCampaignId, 'analytics'],
    queryFn: () => api.campaigns.analytics(latestCampaignId!),
    enabled: !!latestCampaignId,
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Overview of your CRM activity</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatsCard
          title="Total Customers"
          value={stats ? formatCompact(stats.totalCustomers) : '—'}
          icon={Users}
          iconColor="text-indigo-600"
          loading={statsLoading}
        />
        <StatsCard
          title="Campaigns"
          value={stats ? stats.totalCampaigns : '—'}
          subtitle={stats ? `${stats.activeCampaigns} active` : undefined}
          icon={Megaphone}
          iconColor="text-violet-600"
          loading={statsLoading}
        />
        <StatsCard
          title="Monthly Conversions"
          value={stats ? formatCompact(stats.monthlyConversions) : '—'}
          icon={ShoppingCart}
          iconColor="text-emerald-600"
          loading={statsLoading}
        />
        <StatsCard
          title="Attributed Revenue"
          value={stats ? formatINR(stats.attributedRevenue) : '—'}
          icon={TrendingUp}
          iconColor="text-amber-600"
          loading={statsLoading}
        />
      </div>

      {/* Main content — two columns on wide screens */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left column: funnel + recent campaigns */}
        <div className="flex flex-col gap-6 xl:col-span-2">
          <CampaignFunnel
            analytics={analytics}
            loading={campaignsLoading || (!!latestCampaignId && analyticsLoading)}
          />
          <RecentCampaigns />
        </div>

        {/* Right column: AI Copilot — fixed height so it doesn't stretch to page bottom */}
        <div className="xl:col-span-1 min-h-0" style={{ height: 'calc(100vh - 220px)', maxHeight: 680 }}>
          <AICopilot />
        </div>
      </div>
    </div>
  );
}

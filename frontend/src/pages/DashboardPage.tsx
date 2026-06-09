import { useQuery } from '@tanstack/react-query';
import { Users, Megaphone, TrendingUp, ShoppingCart } from 'lucide-react';
import { api } from '@/lib/api';
import StatsCard from '@/components/dashboard/StatsCard';
import CampaignFunnel from '@/components/dashboard/CampaignFunnel';
import RecentCampaigns from '@/components/dashboard/RecentCampaigns';
import { formatINR, formatCompact } from '@/lib/utils';

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: api.dashboard.stats,
    refetchInterval: 30_000,
  });

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
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[#1C1E1C]">Dashboard</h1>
        <p className="text-sm text-[#4A504A]/70 mt-0.5">Overview of your CRM activity</p>
      </div>

      {/* KPI cards — 1 col on phone, 2 on sm, 4 on xl */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatsCard
          title="Total Customers"
          value={stats ? formatCompact(stats.totalCustomers) : '—'}
          icon={Users}
          iconBg="bg-[#C0CFC0]/40"
          iconColor="text-[#586358]"
          loading={statsLoading}
        />
        <StatsCard
          title="Campaigns"
          value={stats ? stats.totalCampaigns : '—'}
          subtitle={stats ? `${stats.activeCampaigns} active` : undefined}
          icon={Megaphone}
          iconBg="bg-[#C0CFC0]/30"
          iconColor="text-[#4A6A4A]"
          loading={statsLoading}
        />
        <StatsCard
          title="Monthly Conversions"
          value={stats ? formatCompact(stats.monthlyConversions) : '—'}
          icon={ShoppingCart}
          iconBg="bg-[#E5CEC6]/50"
          iconColor="text-[#8B5E52]"
          loading={statsLoading}
        />
        <StatsCard
          title="Attributed Revenue"
          value={stats ? formatINR(stats.attributedRevenue) : '—'}
          icon={TrendingUp}
          iconBg="bg-[#DDA28F]/20"
          iconColor="text-[#A06848]"
          loading={statsLoading}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 sm:gap-6">
        <div className="xl:col-span-3">
          <CampaignFunnel
            analytics={analytics}
            loading={campaignsLoading || (!!latestCampaignId && analyticsLoading)}
          />
        </div>
        <div className="xl:col-span-2">
          <RecentCampaigns />
        </div>
      </div>
    </div>
  );
}

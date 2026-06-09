import { type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  loading?: boolean;
}

export default function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconBg = 'bg-[#C0CFC0]/40',
  iconColor = 'text-[#586358]',
  loading,
}: StatsCardProps) {
  return (
    <Card className="transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgb(0,0,0,0.07)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <p className="text-xs font-medium text-[#4A504A] uppercase tracking-wide">{title}</p>
            {loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <p className="text-2xl font-bold text-[#1C1E1C] tabular-nums">{value}</p>
            )}
            {subtitle && !loading && (
              <p className="text-xs text-[#4A504A]/70">{subtitle}</p>
            )}
          </div>
          <div className={`shrink-0 rounded-2xl p-2.5 ${iconBg} ${iconColor}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

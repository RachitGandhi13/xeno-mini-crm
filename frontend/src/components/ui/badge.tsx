import { cn } from '@/lib/utils';

type Variant = 'default' | 'success' | 'warning' | 'destructive' | 'outline' | 'indigo';

const variantCls: Record<Variant, string> = {
  default:     'bg-slate-100 text-slate-700',
  success:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
  warning:     'bg-amber-50 text-amber-700 border border-amber-200',
  destructive: 'bg-red-50 text-red-700 border border-red-200',
  outline:     'border border-slate-300 text-slate-600',
  indigo:      'bg-indigo-50 text-indigo-700 border border-indigo-200',
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantCls[variant],
        className
      )}
      {...props}
    />
  );
}

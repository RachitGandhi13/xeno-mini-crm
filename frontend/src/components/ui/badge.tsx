import { cn } from '@/lib/utils';

type Variant = 'default' | 'success' | 'warning' | 'destructive' | 'outline' | 'indigo';

const variantCls: Record<Variant, string> = {
  default:     'bg-[#C0CFC0]/40 text-[#4A504A]',
  success:     'bg-[#C0CFC0]/30 text-[#3A5A3A] border border-[#C0CFC0]',
  warning:     'bg-[#E5CEC6]/50 text-[#8B5E52] border border-[#DDA28F]/40',
  destructive: 'bg-red-50 text-red-700 border border-red-200',
  outline:     'border border-[#C0CFC0] text-[#4A504A]',
  indigo:      'bg-[#C0CFC0]/30 text-[#4A504A] border border-[#C0CFC0]',
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        'transition-all duration-300',
        variantCls[variant],
        className
      )}
      {...props}
    />
  );
}

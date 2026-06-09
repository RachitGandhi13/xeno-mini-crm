import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantCls: Record<Variant, string> = {
  default:     'bg-[#586358] text-[#F4F4F3] hover:bg-[#4A504A] hover:-translate-y-0.5 hover:shadow-md shadow-sm',
  outline:     'border border-[#C0CFC0] bg-white/60 text-[#4A504A] hover:bg-[#C0CFC0]/20 hover:-translate-y-0.5',
  ghost:       'text-[#4A504A] hover:bg-[#C0CFC0]/30',
  destructive: 'bg-red-500 text-white hover:bg-red-600 hover:-translate-y-0.5 shadow-sm',
  secondary:   'bg-[#C0CFC0]/40 text-[#4A504A] hover:bg-[#C0CFC0]/60',
};

const sizeCls: Record<Size, string> = {
  sm:   'h-8 px-3 text-xs rounded-xl',
  md:   'h-9 px-4 text-sm rounded-xl',
  lg:   'h-10 px-5 text-sm rounded-xl',
  icon: 'h-9 w-9 rounded-xl',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-medium',
        'transition-all duration-300 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6E7A6E]',
        'disabled:pointer-events-none disabled:opacity-40',
        variantCls[variant],
        sizeCls[size],
        className
      )}
      {...props}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8z" />
        </svg>
      )}
      {children}
    </button>
  )
);
Button.displayName = 'Button';
export { Button };

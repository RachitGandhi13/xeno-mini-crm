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
  default:     'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
  outline:     'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  ghost:       'text-slate-700 hover:bg-slate-100',
  destructive: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  secondary:   'bg-slate-100 text-slate-700 hover:bg-slate-200',
};

const sizeCls: Record<Size, string> = {
  sm:   'h-8 px-3 text-xs',
  md:   'h-9 px-4 text-sm',
  lg:   'h-10 px-5 text-sm',
  icon: 'h-9 w-9',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
        'disabled:pointer-events-none disabled:opacity-50',
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

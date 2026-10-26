import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-[background-color,transform,box-shadow,color] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:brightness-105 shadow-[0_8px_24px_-12px_rgb(var(--c-accent)/0.7)]',
        secondary: 'bg-surface-2 text-fg hover:bg-border/60 border border-border/80',
        ghost: 'text-fg hover:bg-surface-2',
        outline: 'border border-border text-fg hover:bg-surface-2',
        danger: 'bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30',
        link: 'text-accent-text underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-4 text-[15px]',
        lg: 'h-12 px-5 text-base',
        icon: 'size-10',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild, loading, disabled, children, type, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size, block }), className)} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cn(buttonVariants({ variant, size, block }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };

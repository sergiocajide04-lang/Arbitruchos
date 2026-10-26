import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...props} />;
}

export function CardHeader({
  title,
  eyebrow,
  action,
  className,
  as: Heading = 'h2',
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <Heading className="truncate text-[17px] font-semibold tracking-tight">{title}</Heading>
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 sm:p-5', className)} {...props} />;
}

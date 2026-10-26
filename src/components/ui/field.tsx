import { AlertCircle, ChevronDown } from 'lucide-react';
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-xl border border-border bg-surface-2/60 px-3.5 text-fg placeholder:text-muted/70 transition-colors focus:border-accent/70 focus:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60 aria-[invalid=true]:border-danger/70 aria-[invalid=true]:ring-danger/20';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(control, 'h-12', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(control, 'min-h-[88px] py-3', className)} {...props} />,
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <span className={cn('relative', className?.includes('w-auto') ? 'inline-block' : 'block w-full')}>
      <select ref={ref} className={cn(control, 'h-12 appearance-none pr-10', className)} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </span>
  ),
);
Select.displayName = 'Select';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  /** Aviso no bloqueante (p. ej. campo dudoso del OCR). */
  warning?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
  trailing?: ReactNode;
}

/** Etiqueta + control + ayuda/error, con los atributos ARIA enlazados. */
export function Field({ label, hint, error, warning, optional, className, children, trailing }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const warnId = warning ? `${id}-warn` : undefined;
  const describedBy = [hintId, warnId, errorId].filter(Boolean).join(' ') || undefined;
  const child = isValidElement(children)
    ? cloneElement(children, {
        id: (children.props.id as string | undefined) ?? id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })
    : children;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={(children.props.id as string | undefined) ?? id} className="text-sm font-medium text-fg">
          {label}
          {optional && <span className="ml-1.5 text-xs font-normal text-muted">(opcional)</span>}
        </label>
        {trailing}
      </div>
      {child}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {warning && !error && (
        <p id={warnId} className="flex items-start gap-1.5 text-xs text-warning">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{warning}</span>
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-xs font-medium text-danger">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  description,
  id: idProp,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: ReactNode;
  id?: string;
}) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={description ? `${id}-desc` : undefined}
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-md border-border accent-[rgb(var(--c-accent))]"
      />
      <div className="text-sm leading-snug">
        <label htmlFor={id} className="cursor-pointer font-medium">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="mt-0.5 text-xs text-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

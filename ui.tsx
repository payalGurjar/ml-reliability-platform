import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/* ------------------------------- Button --------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-[#1a1203] hover:brightness-110 border border-transparent font-semibold disabled:hover:brightness-100',
  secondary:
    'bg-surface-2 text-ink border border-line hover:border-line-strong hover:bg-surface-3',
  ghost: 'bg-transparent text-ink-dim hover:text-ink hover:bg-surface-2 border border-transparent',
  danger: 'bg-crit-soft text-crit border border-crit/40 hover:bg-crit hover:text-white',
  subtle: 'bg-surface-3 text-ink-dim border border-transparent hover:text-ink',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9.5 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
  icon: 'h-9 w-9 justify-center',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center rounded-md transition-all duration-150 select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

/* -------------------------------- Card ----------------------------------- */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-xl border border-line bg-surface',
        'shadow-[0_1px_2px_rgba(0,0,0,0.25)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex items-start justify-between gap-4 border-b border-line px-5 py-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 text-muted">{icon}</div>}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* -------------------------------- Badge ---------------------------------- */

export type Tone = 'ok' | 'warn' | 'bad' | 'crit' | 'info' | 'muted' | 'accent';

const TONES: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok border-ok/25',
  warn: 'bg-warn-soft text-warn border-warn/25',
  bad: 'bg-bad-soft text-bad border-bad/25',
  crit: 'bg-crit-soft text-crit border-crit/25',
  info: 'bg-info-soft text-info border-info/25',
  accent: 'bg-accent-soft text-accent border-accent/25',
  muted: 'bg-surface-3 text-muted border-line',
};

export function Badge({
  tone = 'muted',
  children,
  className,
  dot,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function statusTone(status?: string | null): Tone {
  switch (status) {
    case 'healthy':
    case 'low':
    case 'resolved':
      return 'ok';
    case 'warning':
    case 'moderate':
    case 'medium':
      return 'warn';
    case 'drifted':
    case 'high':
      return 'bad';
    case 'critical':
    case 'significant':
      return 'crit';
    default:
      return 'muted';
  }
}

/* ------------------------------- Inputs ---------------------------------- */

const fieldBase =
  'w-full rounded-md border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-muted/70 ' +
  'transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50';

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block', className)}>
      {label && (
        <span className="mb-1.5 flex items-center gap-1 text-[12px] font-medium tracking-wide text-ink-dim uppercase">
          {label}
          {required && <span className="text-crit">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-crit">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] leading-snug text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(fieldBase, 'h-9.5', className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(fieldBase, 'py-2 leading-relaxed', className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(fieldBase, 'h-9.5 cursor-pointer appearance-none bg-[length:0] pr-8', className)}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-5.5 w-10 shrink-0 rounded-full border transition-colors',
        checked ? 'border-accent/50 bg-accent' : 'border-line bg-surface-3',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 h-4 w-4 rounded-full bg-[var(--bg)] transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/* ------------------------------ Feedback --------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('shimmer rounded-md', className)} />;
}

export function LoadingPanel({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {label}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && (
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
          {icon}
        </div>
      )}
      <div>
        <h4 className="text-[15px] font-semibold text-ink">{title}</h4>
        {description && <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-crit/30 bg-crit-soft text-crit">
        <XCircle className="h-5 w-5" />
      </div>
      <div>
        <h4 className="text-[15px] font-semibold text-ink">Something went wrong</h4>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-crit/30 bg-crit-soft px-3 py-2 text-[13px] text-crit">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: Tone }) {
  return (
    <div className={cx('flex items-start gap-2 rounded-md border px-3 py-2 text-[13px] leading-relaxed', TONES[tone])}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* -------------------------------- Modal ---------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'rise relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-line bg-surface shadow-2xl sm:rounded-xl',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
            {description && <p className="mt-0.5 text-[13px] leading-snug text-muted">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children && <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>}
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-ink-dim">{message}</p>
    </Modal>
  );
}

/* -------------------------------- Tabs ----------------------------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cx(
            'relative shrink-0 px-3.5 py-2.5 text-[13.5px] font-medium transition-colors',
            value === t.key ? 'text-ink' : 'text-muted hover:text-ink-dim',
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="tnum ml-1.5 rounded bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted">{t.count}</span>
          )}
          {value === t.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ Pagination -------------------------------- */

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
      <p className="tnum text-[12.5px] text-muted">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="tnum px-2 text-[12.5px] text-muted">
          {page} / {pages}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------- Toast ----------------------------------- */

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastContext = createContext<{ push: (kind: ToastKind, message: string) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.floor(performance.now() * 1000) % 1000;
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 5200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'slide-in pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] shadow-lg backdrop-blur',
              t.kind === 'success' && 'border-ok/30 bg-ok-soft text-ok',
              t.kind === 'error' && 'border-crit/30 bg-crit-soft text-crit',
              t.kind === 'info' && 'border-line bg-surface text-ink-dim',
            )}
          >
            {t.kind === 'success' && <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />}
            {t.kind === 'error' && <XCircle className="mt-px h-4 w-4 shrink-0" />}
            {t.kind === 'info' && <Info className="mt-px h-4 w-4 shrink-0" />}
            <span className="min-w-0 flex-1 leading-snug break-words">{t.message}</span>
            <button
              aria-label="Dismiss"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="opacity-60 transition-opacity hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ------------------------------- Misc bits -------------------------------- */

export function Stat({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11.5px] font-medium tracking-wider text-muted uppercase">{label}</p>
        {icon && (
          <div className={cx('rounded-md border p-1.5', tone ? TONES[tone] : 'border-line bg-surface-2 text-muted')}>
            {icon}
          </div>
        )}
      </div>
      <p className="tnum mt-2 text-[26px] leading-none font-semibold text-ink">{value}</p>
      {sub && <div className="mt-1.5 text-[12.5px] text-muted">{sub}</div>}
    </Card>
  );
}

export function MeterBar({ value, tone = 'accent' }: { value: number; tone?: Tone }) {
  const colors: Record<Tone, string> = {
    ok: 'bg-ok',
    warn: 'bg-warn',
    bad: 'bg-bad',
    crit: 'bg-crit',
    info: 'bg-info',
    accent: 'bg-accent',
    muted: 'bg-muted',
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div
        className={cx('h-full rounded-full transition-all duration-500', colors[tone])}
        style={{ width: Math.max(0, Math.min(100, value * 100)) + '%' }}
      />
    </div>
  );
}

export function KeyValue({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="shrink-0 text-[12.5px] text-muted">{label}</span>
      <span className={cx('truncate text-right text-[13px] text-ink', mono && 'tnum')}>{value}</span>
    </div>
  );
}

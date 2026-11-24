export const nf = (v: number | null | undefined, digits = 3) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(digits);

export const pf = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : (Number(v) * 100).toFixed(digits) + '%';

export const intf = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US');

export function pvalue(v: number | null | undefined) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (n < 0.0001) return '<0.0001';
  return n.toFixed(4);
}

export function bytes(n: number | null | undefined) {
  if (!n) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return v.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

export function relativeTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.round(hours / 24);
  if (days < 30) return days + 'd ago';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const STATUS_META: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'crit' | 'muted' }> = {
  healthy: { label: 'Healthy', tone: 'ok' },
  warning: { label: 'Watch', tone: 'warn' },
  drifted: { label: 'Drifted', tone: 'bad' },
  critical: { label: 'Critical', tone: 'crit' },
  unmonitored: { label: 'No runs', tone: 'muted' },
  low: { label: 'Low', tone: 'ok' },
  moderate: { label: 'Moderate', tone: 'warn' },
  significant: { label: 'Significant', tone: 'crit' },
  medium: { label: 'Medium', tone: 'warn' },
  high: { label: 'High', tone: 'bad' },
};

export const ALERT_TYPE_LABEL: Record<string, string> = {
  data_drift: 'Data drift',
  prediction_drift: 'Prediction drift',
  concept_drift: 'Concept drift',
  performance_degradation: 'Performance',
  schema_change: 'Schema change',
  data_validation: 'Data validation',
};

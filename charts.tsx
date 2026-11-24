import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DistributionBin } from '../lib/types';

const COLOR = {
  ref: 'var(--muted)',
  cur: 'var(--accent)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
  crit: 'var(--crit)',
  info: 'var(--info)',
};

function TooltipBox({
  active,
  payload,
  label,
  suffix = '',
  digits = 2,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
  suffix?: string;
  digits?: number;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-[12px] shadow-lg">
      {label !== undefined && <p className="mb-1 font-medium text-ink">{String(label)}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-ink-dim">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="tnum ml-auto text-ink">
            {typeof p.value === 'number' ? p.value.toFixed(digits) : p.value}
            {suffix}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Reference vs current distribution (histogram for numerics, bars for categories). */
export function DistributionChart({ data, height = 230 }: { data: DistributionBin[]; height?: number }) {
  if (!data || !data.length) return <p className="py-8 text-center text-[13px] text-muted">No distribution data.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 4 }} barGap={2}>
        <CartesianGrid strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="bin" interval={0} angle={-28} textAnchor="end" height={64} tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} unit="%" width={48} />
        <Tooltip content={<TooltipBox suffix="%" />} cursor={{ fill: 'var(--surface-3)', opacity: 0.5 }} />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted)' }} iconType="square" iconSize={9} />
        <Bar dataKey="reference" name="Reference" fill={COLOR.ref} radius={[2, 2, 0, 0]} maxBarSize={38} />
        <Bar dataKey="current" name="Production" fill={COLOR.cur} radius={[2, 2, 0, 0]} maxBarSize={38} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** PSI contribution per bin — shows where the shift is concentrated. */
export function ContributionChart({ data, height = 180 }: { data: DistributionBin[]; height?: number }) {
  const rows = (data || []).filter((d) => d.contribution !== undefined);
  if (!rows.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
        <CartesianGrid strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="bin" interval={0} angle={-28} textAnchor="end" height={64} tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={48} />
        <Tooltip content={<TooltipBox digits={4} />} cursor={{ fill: 'var(--surface-3)', opacity: 0.5 }} />
        <Bar dataKey="contribution" name="PSI contribution" radius={[2, 2, 0, 0]} maxBarSize={38}>
          {rows.map((r, i) => (
            <Cell key={i} fill={(r.contribution || 0) > 0.02 ? COLOR.crit : COLOR.info} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Drift share over time. */
export function DriftTrendChart({
  data,
  height = 240,
}: {
  data: { created_at: string; drift_share: number; metric_value?: number | null }[];
  height?: number;
}) {
  const rows = data.map((d) => ({
    t: new Date(d.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    drift: Number(((d.drift_share || 0) * 100).toFixed(2)),
    metric: d.metric_value !== null && d.metric_value !== undefined ? Number((d.metric_value * 100).toFixed(2)) : null,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="driftFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.34} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="t" tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} unit="%" width={48} domain={[0, 100]} />
        <Tooltip content={<TooltipBox suffix="%" />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" iconSize={14} />
        <Area
          type="monotone"
          dataKey="drift"
          name="Features drifted"
          stroke="var(--accent)"
          strokeWidth={2}
          fill="url(#driftFill)"
        />
        <Line type="monotone" dataKey="metric" name="Primary metric" stroke={COLOR.ok} strokeWidth={2} dot={false} connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal ranking of per-feature drift scores. */
export function FeatureDriftChart({
  data,
  thresholdLow,
  thresholdHigh,
  height = 280,
}: {
  data: { feature: string; psi: number; status: string }[];
  thresholdLow: number;
  thresholdHigh: number;
  height?: number;
}) {
  if (!data.length) return <p className="py-8 text-center text-[13px] text-muted">No features analysed.</p>;
  const rows = data.map((d) => ({ ...d, psi: Number((d.psi || 0).toFixed(4)) }));
  const color = (s: string) => (s === 'significant' ? COLOR.crit : s === 'moderate' ? COLOR.warn : COLOR.ok);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="2 4" horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="feature" width={140} tickLine={false} axisLine={false} />
        <Tooltip content={<TooltipBox digits={4} />} cursor={{ fill: 'var(--surface-3)', opacity: 0.4 }} />
        <Bar dataKey="psi" name="PSI" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {rows.map((r, i) => (
            <Cell key={i} fill={color(r.status)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MetricComparisonChart({
  data,
  height = 220,
}: {
  data: { metric: string; reference: number; current: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 4 }} barGap={4}>
        <CartesianGrid strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="metric" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={48} />
        <Tooltip content={<TooltipBox digits={4} />} cursor={{ fill: 'var(--surface-3)', opacity: 0.5 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" iconSize={9} />
        <Bar dataKey="reference" name="Reference" fill={COLOR.ref} radius={[2, 2, 0, 0]} maxBarSize={44} />
        <Bar dataKey="current" name="Production" fill={COLOR.cur} radius={[2, 2, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ConfusionMatrix({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[12.5px]">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-[11px] font-medium tracking-wide text-muted uppercase">
              actual \ predicted
            </th>
            {labels.map((l) => (
              <th key={l} className="tnum px-3 py-1 text-center text-[12px] font-medium text-ink-dim">
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="tnum px-2 py-1 text-right text-[12px] font-medium text-ink-dim">{labels[i]}</td>
              {row.map((v, j) => (
                <td key={j} className="p-0.5">
                  <div
                    className="tnum flex h-11 w-16 items-center justify-center rounded border text-[13px] font-medium"
                    style={{
                      background:
                        i === j
                          ? 'color-mix(in srgb, var(--ok) ' + Math.round((v / max) * 55 + 6) + '%, transparent)'
                          : 'color-mix(in srgb, var(--crit) ' + Math.round((v / max) * 55 + 6) + '%, transparent)',
                      borderColor: 'var(--border)',
                      color: 'var(--text)',
                    }}
                  >
                    {v}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

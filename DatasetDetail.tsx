import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Dataset } from '../lib/types';
import { bytes, dateTime, intf, nf } from '../lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorState, LoadingPanel, Stat, Tabs, statusTone } from '../components/ui';

export default function DatasetDetail() {
  const { id } = useParams();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'schema' | 'preview' | 'validation'>('schema');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDataset(await api.get<Dataset>('/api/datasets', { id, preview: 50 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the dataset.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Card>
        <LoadingPanel label="Loading dataset…" rows={6} />
      </Card>
    );
  }
  if (error || !dataset) {
    return (
      <Card>
        <ErrorState message={error || 'Dataset not found.'} onRetry={load} />
      </Card>
    );
  }

  const columns = dataset.columns || [];
  const preview = dataset.preview || [];
  const issues = dataset.validation?.issues || [];

  return (
    <div className="space-y-5">
      <Link to="/datasets" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All datasets
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold text-ink">{dataset.name}</h1>
            <Badge tone={dataset.kind === 'reference' ? 'info' : 'accent'}>{dataset.kind.replace('_', ' ')}</Badge>
            {dataset.is_demo && <Badge tone="info">demo data</Badge>}
          </div>
          <p className="mt-1.5 text-[13px] text-muted">
            {dataset.file_name || 'uploaded data'} · {bytes(dataset.file_size)} · {dateTime(dataset.created_at)}
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Rows" value={intf(dataset.row_count)} />
        <Stat label="Columns" value={intf(dataset.column_count)} />
        <Stat
          label="Missing cells"
          value={nf(dataset.quality?.missing_pct, 2) + '%'}
          sub={intf(dataset.quality?.missing_cells ?? 0) + ' cells'}
          tone={(dataset.quality?.missing_pct || 0) > 10 ? 'warn' : undefined}
        />
        <Stat
          label="Duplicate rows"
          value={intf(dataset.quality?.duplicate_rows ?? 0)}
          sub={nf(dataset.quality?.duplicate_pct, 2) + '% of rows'}
          tone={(dataset.quality?.duplicate_pct || 0) > 5 ? 'warn' : undefined}
        />
      </div>

      <Card className="overflow-hidden">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'schema', label: 'Schema & statistics', count: columns.length },
            { key: 'preview', label: 'Data preview', count: preview.length },
            { key: 'validation', label: 'Validation', count: issues.length },
          ]}
        />

        {tab === 'schema' && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-[11px] tracking-wider text-muted uppercase">
                  <th className="px-5 py-2.5 font-medium">Column</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Missing</th>
                  <th className="px-3 py-2.5 font-medium">Unique</th>
                  <th className="px-3 py-2.5 font-medium">Min / Max</th>
                  <th className="px-3 py-2.5 font-medium">Mean ± SD</th>
                  <th className="px-5 py-2.5 font-medium">Median (P25–P75) / Top values</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {columns.map((c) => (
                  <tr key={c.name} className="hover:bg-surface-2">
                    <td className="px-5 py-2.5 text-[13px] font-medium text-ink">{c.name}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={c.type === 'numerical' ? 'info' : c.type === 'binary' ? 'accent' : 'muted'}>{c.type}</Badge>
                    </td>
                    <td className="tnum px-3 py-2.5 text-[12.5px] text-ink-dim">
                      {c.missing} <span className="text-muted">({nf(c.missing_pct, 1)}%)</span>
                    </td>
                    <td className="tnum px-3 py-2.5 text-[12.5px] text-ink-dim">{intf(c.unique ?? 0)}</td>
                    <td className="tnum px-3 py-2.5 text-[12.5px] text-ink-dim">
                      {c.type === 'numerical' ? `${nf(c.min, 2)} / ${nf(c.max, 2)}` : '—'}
                    </td>
                    <td className="tnum px-3 py-2.5 text-[12.5px] text-ink-dim">
                      {c.type === 'numerical' ? `${nf(c.mean, 3)} ± ${nf(c.std, 3)}` : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-[12.5px] text-ink-dim">
                      {c.type === 'numerical' ? (
                        <span className="tnum">
                          {nf(c.median, 3)} ({nf(c.p25, 3)}–{nf(c.p75, 3)})
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(c.top_values || []).slice(0, 4).map((v) => (
                            <span key={v.value} className="rounded bg-surface-3 px-1.5 py-0.5 text-[11.5px]">
                              {v.value} <span className="tnum text-muted">{nf(v.pct, 1)}%</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'preview' && (
          <div className="overflow-x-auto">
            {preview.length ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-[11px] tracking-wider text-muted uppercase">
                    {columns.map((c) => (
                      <th key={c.name} className="px-3 py-2.5 font-medium whitespace-nowrap">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {preview.map((row, i) => (
                    <tr key={i} className="hover:bg-surface-2">
                      {columns.map((c) => {
                        const v = row[c.name];
                        return (
                          <td key={c.name} className="tnum px-3 py-2 text-[12.5px] whitespace-nowrap text-ink-dim">
                            {v === null || v === undefined || v === '' ? (
                              <span className="text-muted italic">null</span>
                            ) : (
                              String(v)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState title="No preview rows" />
            )}
          </div>
        )}

        {tab === 'validation' && (
          <div className="p-5">
            {issues.length === 0 ? (
              <div className="flex items-center gap-3 rounded-lg border border-ok/25 bg-ok-soft px-4 py-3 text-ok">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-[13.5px] font-medium">All validation rules passed</p>
                  <p className="text-[12.5px] opacity-80">
                    No missing-value, cardinality, variance or duplication problems were detected.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={statusTone(issue.level)}>{issue.level}</Badge>
                        <span className="tnum text-[11.5px] text-muted">{issue.rule}</span>
                        {issue.column && <span className="text-[12px] text-ink-dim">{issue.column}</span>}
                      </div>
                      <p className="mt-1 text-[13px] leading-snug text-ink-dim">{issue.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="How this profile is used"
          subtitle="The stored schema drives drift-method selection and schema-change detection."
        />
        <div className="space-y-2 px-5 py-4 text-[13px] leading-relaxed text-muted">
          <p>
            <span className="text-ink-dim">Numerical columns</span> are compared with the Population Stability Index
            (quantile binning), the two-sample Kolmogorov–Smirnov test and Jensen–Shannon divergence.
          </p>
          <p>
            <span className="text-ink-dim">Categorical and binary columns</span> are compared with PSI over category
            proportions, a Pearson chi-square goodness-of-fit test with Laplace-smoothed expectations, and
            Jensen–Shannon divergence, plus explicit new/missing category detection.
          </p>
          <p>
            Columns present in one dataset but not the other are reported as a schema change rather than silently
            dropped.
          </p>
        </div>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BrainCircuit,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import type { AiExplanation, Alert, ClassificationMetrics, Dataset, DriftResult, Metrics, Model, MonitoringRun, Project, RegressionMetrics } from '../lib/types';
import { ALERT_TYPE_LABEL, dateTime, intf, nf, pf, pvalue, relativeTime, STATUS_META } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  KeyValue,
  LoadingPanel,
  MeterBar,
  Note,
  Select,
  Stat,
  Tabs,
  statusTone,
  useToast,
  type Tone,
} from '../components/ui';
import { ConfusionMatrix, ContributionChart, DistributionChart, FeatureDriftChart, MetricComparisonChart } from '../components/charts';
import { exportCsv, exportPdf } from '../lib/report';

interface RunDetailData {
  run: MonitoringRun;
  drift_results: DriftResult[];
  performance_results: { id: number; scope: string; task_type: string; metrics: Metrics; degraded: boolean }[];
  ai_explanations: AiExplanation[];
  alerts: Alert[];
  project: Project | null;
  model: Model | null;
  reference_dataset: Dataset | null;
  current_dataset: Dataset | null;
}

type TabKey = 'drift' | 'performance' | 'ai' | 'alerts' | 'config';

export default function RunDetail() {
  const { id } = useParams();
  const [data, setData] = useState<RunDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('drift');
  const [exporting, setExporting] = useState<string | null>(null);
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<RunDetailData>('/api/monitoring', { id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the monitoring run.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const doExport = async (format: 'pdf' | 'csv') => {
    setExporting(format);
    try {
      const file = format === 'pdf' ? await exportPdf(id!) : await exportCsv(id!);
      push('success', 'Downloaded ' + file);
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <LoadingPanel label="Loading monitoring run…" rows={6} />
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <ErrorState message={error || 'Run not found.'} onRetry={load} />
      </Card>
    );
  }

  const { run } = data;
  const features = data.drift_results.filter((d) => d.kind === 'feature');
  const predictionDrift = data.drift_results.find((d) => d.kind === 'prediction') || null;
  const targetDrift = data.drift_results.find((d) => d.kind === 'target') || null;

  return (
    <div className="space-y-5">
      <Link to="/monitoring" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> Monitoring history
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold text-ink">{run.name}</h1>
            <Badge tone={statusTone(run.overall_status)} dot>
              {STATUS_META[run.overall_status]?.label || run.overall_status}
            </Badge>
            {run.is_demo && <Badge tone="info">demo data</Badge>}
          </div>
          <p className="mt-1.5 text-[13px] text-muted">
            {data.project?.name || '—'}
            {data.model ? ' · ' + data.model.name + ' (' + data.model.task_type + ')' : ' · no model attached'} ·{' '}
            {dateTime(run.created_at)} · computed in {run.duration_ms} ms
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => doExport('csv')} loading={exporting === 'csv'}>
            <FileSpreadsheet className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button size="sm" variant="primary" onClick={() => doExport('pdf')} loading={exporting === 'pdf'}>
            <Download className="h-3.5 w-3.5" />
            PDF report
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Features drifted"
          value={`${run.drifted_features}/${run.total_features}`}
          sub={<MeterBar value={Number(run.drift_share)} tone={statusTone(run.overall_status)} />}
          tone={statusTone(run.overall_status)}
        />
        <Stat label="Significant drift" value={intf(run.significant_features)} sub={`PSI above ${run.config?.psi_high}`} />
        <Stat
          label="Primary metric"
          value={run.performance?.comparison ? nf(run.performance.comparison.current, 4) : '—'}
          sub={
            run.performance?.comparison
              ? `${run.performance.comparison.metric} · ref ${nf(run.performance.comparison.reference, 4)}`
              : 'no labelled production data'
          }
          tone={run.performance?.comparison?.degraded ? 'crit' : run.performance?.comparison ? 'ok' : 'muted'}
        />
        <Stat
          label="Rows compared"
          value={intf(run.summary?.current_rows)}
          sub={`vs ${intf(run.summary?.reference_rows)} reference rows`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Drift by feature" subtitle="Population Stability Index, ranked. Colour encodes the status band." />
          <div className="p-4">
            <FeatureDriftChart
              data={features.slice(0, 12).map((f) => ({ feature: f.feature, psi: Number(f.psi || 0), status: f.status }))}
              thresholdLow={Number(run.config?.psi_low ?? 0.1)}
              thresholdHigh={Number(run.config?.psi_high ?? 0.2)}
              height={Math.max(220, Math.min(12, features.length) * 26 + 40)}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Drift taxonomy" subtitle="The four failure modes are measured separately." />
          <div className="space-y-2.5 p-4">
            <TaxonomyRow
              label="Data drift"
              detail={`${run.drifted_features}/${run.total_features} input features shifted (${pf(run.drift_share)}).`}
              tone={run.drifted_features ? (run.significant_features ? 'crit' : 'warn') : 'ok'}
              state={run.drifted_features ? (run.significant_features ? 'Significant' : 'Detected') : 'None'}
            />
            <TaxonomyRow
              label="Prediction drift"
              detail={
                predictionDrift
                  ? `Output "${predictionDrift.feature}" PSI ${nf(predictionDrift.psi, 4)}, JS ${nf(predictionDrift.js_divergence, 4)}.`
                  : 'No prediction column available in both datasets.'
              }
              tone={predictionDrift ? statusTone(predictionDrift.status) : 'muted'}
              state={predictionDrift ? STATUS_META[predictionDrift.status]?.label || predictionDrift.status : 'Not evaluated'}
            />
            <TaxonomyRow
              label="Concept drift"
              detail={run.concept_drift?.explanation || 'Not evaluated.'}
              tone={run.concept_drift?.detected ? 'crit' : run.concept_drift?.evaluated ? 'ok' : 'muted'}
              state={
                run.concept_drift?.evaluated
                  ? run.concept_drift.detected
                    ? run.concept_drift.type === 'concept_drift'
                      ? 'Suspected'
                      : 'Covariate-driven'
                    : 'Stable'
                  : 'Not evaluated'
              }
            />
            <TaxonomyRow
              label="Performance degradation"
              detail={
                run.performance?.comparison
                  ? `${run.performance.comparison.metric.toUpperCase()} ${nf(run.performance.comparison.reference, 4)} → ${nf(run.performance.comparison.current, 4)} (${(run.performance.comparison.relative * 100).toFixed(1)}%).`
                  : 'Requires ground-truth labels in the production window.'
              }
              tone={run.performance?.comparison?.degraded ? 'crit' : run.performance?.comparison ? 'ok' : 'muted'}
              state={
                run.performance?.comparison
                  ? run.performance.comparison.degraded
                    ? 'Degraded'
                    : 'Within tolerance'
                  : 'Not evaluated'
              }
            />
            {targetDrift && (
              <TaxonomyRow
                label="Target drift"
                detail={`Label distribution "${targetDrift.feature}" PSI ${nf(targetDrift.psi, 4)}.`}
                tone={statusTone(targetDrift.status)}
                state={STATUS_META[targetDrift.status]?.label || targetDrift.status}
              />
            )}
          </div>
        </Card>
      </div>

      {run.schema_diff?.changed && (
        <Note tone="warn">
          <span className="font-medium">Schema change detected.</span>{' '}
          {run.schema_diff.added.length > 0 && <>Added: {run.schema_diff.added.join(', ')}. </>}
          {run.schema_diff.removed.length > 0 && <>Removed: {run.schema_diff.removed.join(', ')}. </>}
          {run.schema_diff.type_changed.length > 0 && (
            <>Retyped: {run.schema_diff.type_changed.map((t) => `${t.column} ${t.from}→${t.to}`).join(', ')}.</>
          )}{' '}
          Only columns present in both datasets were compared.
        </Note>
      )}

      <Card className="overflow-hidden">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'drift', label: 'Feature drift', count: features.length },
            { key: 'performance', label: 'Performance' },
            { key: 'ai', label: 'AI analysis', count: data.ai_explanations.length },
            { key: 'alerts', label: 'Alerts', count: data.alerts.length },
            { key: 'config', label: 'Run details' },
          ]}
        />

        {tab === 'drift' && (
          <DriftTab features={features} extras={[predictionDrift, targetDrift].filter(Boolean) as DriftResult[]} run={run} />
        )}
        {tab === 'performance' && <PerformanceTab data={data} />}
        {tab === 'ai' && <AiTab runId={run.id} explanations={data.ai_explanations} onGenerated={load} />}
        {tab === 'alerts' && <AlertsTab alerts={data.alerts} onChanged={load} />}
        {tab === 'config' && <ConfigTab data={data} />}
      </Card>
    </div>
  );
}

function TaxonomyRow({
  label,
  detail,
  tone,
  state,
}: {
  label: string;
  detail: string;
  tone: Tone;
  state: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        <Badge tone={tone} dot>
          {state}
        </Badge>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-muted">{detail}</p>
    </div>
  );
}

/* ------------------------------- Drift tab -------------------------------- */

function DriftTab({ features, extras, run }: { features: DriftResult[]; extras: DriftResult[]; run: MonitoringRun }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const rows = [...extras, ...features].filter((f) => {
    if (statusFilter && f.status !== statusFilter) return false;
    if (typeFilter && f.feature_type !== typeFilter) return false;
    if (search.trim() && !f.feature.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="flex flex-wrap gap-2 border-b border-line p-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search features…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="w-auto min-w-[140px]" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="low">Low</option>
          <option value="moderate">Moderate</option>
          <option value="significant">Significant</option>
        </Select>
        <Select className="w-auto min-w-[140px]" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="numerical">Numerical</option>
          <option value="categorical">Categorical</option>
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No features match" description="Adjust the search or filters above." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-[11px] tracking-wider text-muted uppercase">
                <th className="px-5 py-2.5 font-medium">Feature</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">PSI</th>
                <th className="px-3 py-2.5 font-medium">KS / χ²</th>
                <th className="px-3 py-2.5 font-medium">p-value</th>
                <th className="px-3 py-2.5 font-medium">JS</th>
                <th className="px-3 py-2.5 font-medium">Ref → Prod</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((f) => (
                <>
                  <tr
                    key={f.id}
                    onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                    className="cursor-pointer transition-colors hover:bg-surface-2"
                  >
                    <td className="px-5 py-2.5">
                      <span className="text-[13px] font-medium text-ink">{f.feature}</span>
                      {f.kind !== 'feature' && (
                        <Badge tone="info" className="ml-2">
                          {f.kind}
                        </Badge>
                      )}
                      {f.new_categories?.length > 0 && (
                        <Badge tone="crit" className="ml-2">
                          {f.new_categories.length} new
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-muted">{f.feature_type}</td>
                    <td className="tnum px-3 py-2.5 text-[12.5px] text-ink">{nf(f.psi, 4)}</td>
                    <td className="tnum px-3 py-2.5 text-[12.5px] text-ink-dim">
                      {f.feature_type === 'numerical' ? nf(f.ks_statistic, 4) : nf(f.chi2_statistic, 2)}
                      {f.feature_type === 'categorical' && f.chi2_df !== null && (
                        <span className="text-muted"> (df {f.chi2_df})</span>
                      )}
                    </td>
                    <td className="tnum px-3 py-2.5 text-[12.5px] text-ink-dim">
                      {pvalue(f.feature_type === 'numerical' ? f.ks_pvalue : f.chi2_pvalue)}
                    </td>
                    <td className="tnum px-3 py-2.5 text-[12.5px] text-ink-dim">{nf(f.js_divergence, 4)}</td>
                    <td className="tnum px-3 py-2.5 text-[12px] text-muted">
                      {f.feature_type === 'numerical'
                        ? `${nf(f.reference_stats?.mean, 2)} → ${nf(f.current_stats?.mean, 2)}`
                        : `${f.reference_stats?.unique ?? 0} → ${f.current_stats?.unique ?? 0} cats`}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone={statusTone(f.status)} dot>
                        {STATUS_META[f.status]?.label || f.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <ChevronDown
                        className={'h-4 w-4 text-muted transition-transform ' + (expanded === f.id ? 'rotate-180' : '')}
                      />
                    </td>
                  </tr>
                  {expanded === f.id && (
                    <tr key={f.id + '-detail'}>
                      <td colSpan={9} className="bg-surface-2 px-5 py-4">
                        <FeatureDetail feature={f} run={run} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FeatureDetail({ feature: f, run }: { feature: DriftResult; run: MonitoringRun }) {
  const numeric = f.feature_type === 'numerical';
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <p className="mb-2 text-[12px] font-medium tracking-wide text-muted uppercase">
          {numeric ? 'Reference vs production histogram (quantile bins)' : 'Category proportions'}
        </p>
        <DistributionChart data={f.distribution || []} />
        {numeric && (f.distribution || []).some((d) => d.contribution !== undefined) && (
          <>
            <p className="mt-3 mb-1 text-[12px] font-medium tracking-wide text-muted uppercase">
              PSI contribution per bin
            </p>
            <ContributionChart data={f.distribution} />
          </>
        )}
      </div>

      <div className="space-y-3">
        <div className="rounded-lg border border-line bg-surface px-3.5 py-2.5">
          <p className="mb-1 text-[12px] font-medium tracking-wide text-muted uppercase">Statistical tests</p>
          {numeric ? (
            <>
              <KeyValue label="PSI" value={nf(f.psi, 6)} mono />
              <KeyValue label="Kolmogorov–Smirnov D" value={nf(f.ks_statistic, 6)} mono />
              <KeyValue label="KS p-value" value={pvalue(f.ks_pvalue)} mono />
              <KeyValue label="Jensen–Shannon" value={nf(f.js_divergence, 6)} mono />
            </>
          ) : (
            <>
              <KeyValue label="PSI" value={nf(f.psi, 6)} mono />
              <KeyValue label="Chi-square" value={nf(f.chi2_statistic, 4)} mono />
              <KeyValue label="Degrees of freedom" value={f.chi2_df ?? '—'} mono />
              <KeyValue label="Chi-square p-value" value={pvalue(f.chi2_pvalue)} mono />
              <KeyValue label="Jensen–Shannon" value={nf(f.js_divergence, 6)} mono />
            </>
          )}
          <p className="mt-2 border-t border-line pt-2 text-[11.5px] leading-snug text-muted">
            Bands: PSI &lt; {run.config?.psi_low} low · {run.config?.psi_low}–{run.config?.psi_high} moderate · &gt;{' '}
            {run.config?.psi_high} significant. Tests use α = {numeric ? run.config?.ks_alpha : run.config?.chi2_alpha}.
          </p>
        </div>

        <div className="rounded-lg border border-line bg-surface px-3.5 py-2.5">
          <p className="mb-1 text-[12px] font-medium tracking-wide text-muted uppercase">Reference vs production</p>
          {numeric ? (
            <>
              <KeyValue label="Mean" value={`${nf(f.reference_stats?.mean, 4)} → ${nf(f.current_stats?.mean, 4)}`} mono />
              <KeyValue label="Std dev" value={`${nf(f.reference_stats?.std, 4)} → ${nf(f.current_stats?.std, 4)}`} mono />
              <KeyValue label="Median" value={`${nf(f.reference_stats?.median, 4)} → ${nf(f.current_stats?.median, 4)}`} mono />
              <KeyValue label="P25" value={`${nf(f.reference_stats?.p25, 4)} → ${nf(f.current_stats?.p25, 4)}`} mono />
              <KeyValue label="P75" value={`${nf(f.reference_stats?.p75, 4)} → ${nf(f.current_stats?.p75, 4)}`} mono />
              <KeyValue label="Min / Max" value={`${nf(f.reference_stats?.min, 2)}/${nf(f.reference_stats?.max, 2)} → ${nf(f.current_stats?.min, 2)}/${nf(f.current_stats?.max, 2)}`} mono />
            </>
          ) : (
            <>
              <KeyValue label="Distinct categories" value={`${f.reference_stats?.unique ?? 0} → ${f.current_stats?.unique ?? 0}`} mono />
              <KeyValue label="New categories" value={f.new_categories?.length ? f.new_categories.join(', ') : 'none'} />
              <KeyValue label="Missing categories" value={f.missing_categories?.length ? f.missing_categories.join(', ') : 'none'} />
            </>
          )}
          <KeyValue
            label="Missing values"
            value={`${nf(f.reference_stats?.missing_pct, 2)}% → ${nf(f.current_stats?.missing_pct, 2)}%`}
            mono
          />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Performance tab ----------------------------- */

function PerformanceTab({ data }: { data: RunDetailData }) {
  const ref = data.performance_results.find((p) => p.scope === 'reference');
  const cur = data.performance_results.find((p) => p.scope === 'current');
  const comparison = data.run.performance?.comparison;

  if (!ref && !cur) {
    return (
      <EmptyState
        title="Performance was not evaluated"
        description="Attach a model with target and prediction columns present in both datasets. The platform reports metrics as not evaluated rather than estimating them."
      />
    );
  }

  const isClassification = (m?: Metrics): m is ClassificationMetrics => !!m && m.taskType === 'classification';
  const isRegression = (m?: Metrics): m is RegressionMetrics => !!m && m.taskType === 'regression';

  const chartData = isClassification(cur?.metrics)
    ? [
        { metric: 'accuracy', reference: Number(nf(isClassification(ref?.metrics) ? ref!.metrics.accuracy : 0, 4)), current: Number(nf(cur!.metrics.accuracy, 4)) },
        { metric: 'precision', reference: Number(nf(isClassification(ref?.metrics) ? ref!.metrics.precision : 0, 4)), current: Number(nf(cur!.metrics.precision, 4)) },
        { metric: 'recall', reference: Number(nf(isClassification(ref?.metrics) ? ref!.metrics.recall : 0, 4)), current: Number(nf(cur!.metrics.recall, 4)) },
        { metric: 'f1', reference: Number(nf(isClassification(ref?.metrics) ? ref!.metrics.f1 : 0, 4)), current: Number(nf(cur!.metrics.f1, 4)) },
        ...(cur!.metrics.rocAuc !== null && isClassification(ref?.metrics) && ref!.metrics.rocAuc !== null
          ? [{ metric: 'roc-auc', reference: Number(nf(ref!.metrics.rocAuc, 4)), current: Number(nf(cur!.metrics.rocAuc, 4)) }]
          : []),
      ]
    : isRegression(cur?.metrics) && isRegression(ref?.metrics)
      ? [
          { metric: 'MAE', reference: Number(nf(ref!.metrics.mae, 4)), current: Number(nf(cur!.metrics.mae, 4)) },
          { metric: 'RMSE', reference: Number(nf(ref!.metrics.rmse, 4)), current: Number(nf(cur!.metrics.rmse, 4)) },
          { metric: 'R²', reference: Number(nf(ref!.metrics.r2, 4)), current: Number(nf(cur!.metrics.r2, 4)) },
        ]
      : [];

  return (
    <div className="space-y-5 p-5">
      {comparison && (
        <div
          className={
            'rounded-lg border px-4 py-3 ' +
            (comparison.degraded ? 'border-crit/30 bg-crit-soft' : 'border-ok/25 bg-ok-soft')
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={comparison.degraded ? 'crit' : 'ok'}>
              {comparison.degraded ? 'degradation detected' : 'within tolerance'}
            </Badge>
            <span className="tnum text-[13px] text-ink">
              {comparison.metric.toUpperCase()} {nf(comparison.reference, 4)} → {nf(comparison.current, 4)} (
              {comparison.relative >= 0 ? '+' : ''}
              {(comparison.relative * 100).toFixed(2)}%)
            </span>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-dim">
            Degradation threshold: {pf(data.run.config?.perf_degradation_threshold ?? 0.05)} relative drop on the primary
            metric. Severity: {comparison.severity}.
          </p>
        </div>
      )}

      <Note tone={data.run.concept_drift?.detected ? 'bad' : 'info'}>
        <span className="font-medium">Concept drift: </span>
        {data.run.concept_drift?.explanation}
      </Note>

      {chartData.length > 0 && (
        <div>
          <p className="mb-2 text-[12px] font-medium tracking-wide text-muted uppercase">Reference vs production metrics</p>
          <MetricComparisonChart data={chartData} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(['reference', 'current'] as const).map((scope) => {
          const entry = scope === 'reference' ? ref : cur;
          return (
            <Card key={scope}>
              <CardHeader
                title={scope === 'reference' ? 'Reference window' : 'Production window'}
                subtitle={entry ? `${intf(entry.metrics.n)} labelled samples` : 'Not evaluated'}
              />
              <div className="px-5 py-3">
                {!entry ? (
                  <p className="text-[13px] text-muted">
                    No ground-truth labels available for this window, so metrics could not be computed.
                  </p>
                ) : isClassification(entry.metrics) ? (
                  <>
                    <KeyValue label="Accuracy" value={nf(entry.metrics.accuracy, 6)} mono />
                    <KeyValue label="Precision (weighted)" value={nf(entry.metrics.precision, 6)} mono />
                    <KeyValue label="Recall (weighted)" value={nf(entry.metrics.recall, 6)} mono />
                    <KeyValue label="F1 (weighted)" value={nf(entry.metrics.f1, 6)} mono />
                    <KeyValue label="F1 (macro)" value={nf(entry.metrics.macro?.f1, 6)} mono />
                    <KeyValue
                      label="ROC-AUC"
                      value={entry.metrics.rocAuc === null ? 'needs probability column' : nf(entry.metrics.rocAuc, 6)}
                      mono
                    />
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="mb-2 text-[12px] font-medium tracking-wide text-muted uppercase">Confusion matrix</p>
                      <ConfusionMatrix labels={entry.metrics.labels} matrix={entry.metrics.matrix} />
                    </div>
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="mb-1.5 text-[12px] font-medium tracking-wide text-muted uppercase">Per class</p>
                      <table className="w-full text-left text-[12.5px]">
                        <thead>
                          <tr className="text-[11px] text-muted uppercase">
                            <th className="py-1 font-medium">class</th>
                            <th className="py-1 font-medium">precision</th>
                            <th className="py-1 font-medium">recall</th>
                            <th className="py-1 font-medium">f1</th>
                            <th className="py-1 font-medium">support</th>
                          </tr>
                        </thead>
                        <tbody className="tnum">
                          {entry.metrics.perClass.map((c) => (
                            <tr key={c.label} className="border-t border-line">
                              <td className="py-1 text-ink">{c.label}</td>
                              <td className="py-1 text-ink-dim">{nf(c.precision, 4)}</td>
                              <td className="py-1 text-ink-dim">{nf(c.recall, 4)}</td>
                              <td className="py-1 text-ink-dim">{nf(c.f1, 4)}</td>
                              <td className="py-1 text-muted">{c.support}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : isRegression(entry.metrics) ? (
                  <>
                    <KeyValue label="MAE" value={nf(entry.metrics.mae, 6)} mono />
                    <KeyValue label="MSE" value={nf(entry.metrics.mse, 6)} mono />
                    <KeyValue label="RMSE" value={nf(entry.metrics.rmse, 6)} mono />
                    <KeyValue label="R²" value={nf(entry.metrics.r2, 6)} mono />
                    <KeyValue label="MAPE" value={entry.metrics.mape === null ? '—' : nf(entry.metrics.mape, 3) + '%'} mono />
                  </>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------- AI tab ----------------------------------- */

function AiTab({
  runId,
  explanations,
  onGenerated,
}: {
  runId: number;
  explanations: AiExplanation[];
  onGenerated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { push } = useToast();

  const generate = async () => {
    setBusy(true);
    try {
      await api.post('/api/ai-analysis', { run_id: runId });
      push('success', 'AI analysis generated and stored.');
      onGenerated();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'AI analysis failed.');
    } finally {
      setBusy(false);
    }
  };

  const latest = explanations[0];

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3">
        <div className="flex items-start gap-3">
          <BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <p className="text-[13.5px] font-medium text-ink">Drift explanation &amp; generative root-cause analysis</p>
            <p className="mt-0.5 max-w-xl text-[12.5px] leading-snug text-muted">
              Reasons strictly over the stored statistics for this run. Causal statements are labelled as hypotheses;
              nothing is asserted that the numbers do not support.
            </p>
          </div>
        </div>
        <Button variant="primary" onClick={generate} loading={busy}>
          <Sparkles className="h-3.5 w-3.5" />
          {latest ? 'Regenerate analysis' : 'Generate AI analysis'}
        </Button>
      </div>

      {!latest ? (
        <EmptyState
          icon={<BrainCircuit className="h-5 w-5" />}
          title="No analysis generated yet"
          description="Generate an analysis to get an explanation of the drift, the most affected features, root-cause hypotheses, business impact, reliability risks and prioritised corrective actions."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <Badge tone={statusTone(latest.priority)}>{latest.priority} priority</Badge>
            <span>
              {latest.provider === 'builtin-statistical-reasoner' ? 'Built-in statistical reasoner' : 'LLM: ' + (latest.llm_model || latest.provider)}
            </span>
            <span>· {relativeTime(latest.created_at)}</span>
            {explanations.length > 1 && <span>· {explanations.length} analyses stored</span>}
          </div>

          <Section title="Drift explanation">
            <p className="text-[13.5px] leading-relaxed text-ink-dim">{latest.summary}</p>
          </Section>

          {latest.affected_features?.length > 0 && (
            <Section title="Most affected features">
              <div className="space-y-2">
                {latest.affected_features.map((f) => (
                  <div key={f.feature} className="rounded-md border border-line bg-surface-2 px-3.5 py-2.5">
                    <p className="text-[13px] font-medium text-ink">{f.feature}</p>
                    <p className="tnum mt-0.5 text-[12.5px] leading-relaxed text-muted">{f.reason}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Possible root causes">
              <BulletList items={latest.root_causes} />
            </Section>
            <Section title="Model reliability risks">
              <BulletList items={latest.risks} />
            </Section>
          </div>

          <Section title="Potential business impact">
            <p className="text-[13.5px] leading-relaxed text-ink-dim">{latest.business_impact}</p>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Recommended investigation steps">
              <BulletList items={latest.investigation_steps} ordered />
            </Section>
            <Section title="Corrective actions">
              <div className="space-y-2">
                {(latest.corrective_actions || []).map((a, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <Badge tone={statusTone(a.priority)}>{a.priority}</Badge>
                    <p className="flex-1 text-[13px] leading-relaxed text-ink-dim">{a.action}</p>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-medium tracking-wide text-muted uppercase">{title}</p>
      {children}
    </div>
  );
}

function BulletList({ items, ordered }: { items: string[]; ordered?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {(items || []).map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink-dim">
          <span className="tnum mt-px shrink-0 text-muted">{ordered ? i + 1 + '.' : '—'}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------- Alerts tab --------------------------------- */

function AlertsTab({ alerts, onChanged }: { alerts: Alert[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const { push } = useToast();

  const toggle = async (a: Alert) => {
    setBusy(a.id);
    try {
      await api.put('/api/alerts', { id: a.id, status: a.status === 'open' ? 'resolved' : 'open' });
      push('success', a.status === 'open' ? 'Alert resolved.' : 'Alert reopened.');
      onChanged();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Failed to update the alert.');
    } finally {
      setBusy(null);
    }
  };

  if (!alerts.length) {
    return <EmptyState title="No alerts raised" description="This run did not breach any configured threshold." />;
  }

  return (
    <div className="divide-y divide-[var(--border)]">
      {alerts.map((a) => (
        <div key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(a.severity)}>{a.severity}</Badge>
              <span className="text-[11px] tracking-wide text-muted uppercase">{ALERT_TYPE_LABEL[a.type] || a.type}</span>
              {a.status === 'resolved' && <Badge tone="ok">resolved</Badge>}
            </div>
            <p className="mt-1.5 text-[13.5px] font-medium text-ink">{a.title}</p>
            <p className="tnum mt-0.5 text-[12.5px] leading-snug text-muted">{a.message}</p>
          </div>
          <Button size="sm" variant={a.status === 'open' ? 'secondary' : 'ghost'} loading={busy === a.id} onClick={() => toggle(a)}>
            {a.status === 'open' ? 'Resolve' : 'Reopen'}
          </Button>
        </div>
      ))}
    </div>
  );
}

/* ----------------------------- Config tab --------------------------------- */

function ConfigTab({ data }: { data: RunDetailData }) {
  const { run } = data;
  return (
    <div className="grid gap-4 p-5 lg:grid-cols-3">
      <Card>
        <CardHeader title="Thresholds used" subtitle="Snapshot taken at execution time." />
        <div className="px-5 py-3">
          {Object.entries(run.config || {}).map(([k, v]) => (
            <KeyValue key={k} label={k.replace(/_/g, ' ')} value={String(v)} mono />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Reference dataset" />
        <div className="px-5 py-3">
          <KeyValue label="Name" value={data.reference_dataset?.name || '—'} />
          <KeyValue label="Rows" value={intf(run.summary?.reference_profile?.row_count)} mono />
          <KeyValue label="Columns" value={intf(run.summary?.reference_profile?.column_count)} mono />
          <KeyValue label="Missing" value={nf(run.summary?.reference_profile?.missing_pct, 2) + '%'} mono />
          <KeyValue label="Duplicates" value={intf(run.summary?.reference_profile?.duplicate_rows)} mono />
          {data.reference_dataset && (
            <Link to={`/datasets/${data.reference_dataset.id}`} className="mt-2 block text-[12.5px] text-accent hover:underline">
              View dataset profile →
            </Link>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Production dataset" />
        <div className="px-5 py-3">
          <KeyValue label="Name" value={data.current_dataset?.name || '—'} />
          <KeyValue label="Rows" value={intf(run.summary?.current_profile?.row_count)} mono />
          <KeyValue label="Columns" value={intf(run.summary?.current_profile?.column_count)} mono />
          <KeyValue label="Missing" value={nf(run.summary?.current_profile?.missing_pct, 2) + '%'} mono />
          <KeyValue label="Duplicates" value={intf(run.summary?.current_profile?.duplicate_rows)} mono />
          {data.current_dataset && (
            <Link to={`/datasets/${data.current_dataset.id}`} className="mt-2 block text-[12.5px] text-accent hover:underline">
              View dataset profile →
            </Link>
          )}
        </div>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader title="Data validation" subtitle="Quality rules evaluated on both windows." />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          {(['reference', 'current'] as const).map((scope) => {
            const v = run.validation?.[scope];
            return (
              <div key={scope}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[12px] font-medium tracking-wide text-muted uppercase">{scope}</span>
                  <Badge tone={v?.passed ? 'ok' : 'bad'}>{v?.passed ? 'passed' : 'issues found'}</Badge>
                </div>
                {v?.issues?.length ? (
                  <ul className="space-y-1.5">
                    {v.issues.map((issue, i) => (
                      <li key={i} className="flex gap-2 text-[12.5px] leading-snug text-muted">
                        <Badge tone={statusTone(issue.level)}>{issue.level}</Badge>
                        <span className="flex-1">{issue.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12.5px] text-muted">No issues detected.</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader title="Reports generated from this run" icon={<FileText className="h-4 w-4" />} />
        <div className="px-5 py-3 text-[13px] text-muted">
          Use the CSV or PDF buttons at the top of this page. Each export is recorded in the{' '}
          <Link to="/reports" className="text-accent hover:underline">
            Reports
          </Link>{' '}
          history with its format, file name and timestamp.
        </div>
      </Card>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BellRing,
  Boxes,
  Database,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingDown,
} from 'lucide-react';
import { api } from '../lib/api';
import type { DashboardData } from '../lib/types';
import { ALERT_TYPE_LABEL, dateTime, intf, nf, pf, relativeTime, STATUS_META } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingPanel,
  MeterBar,
  Skeleton,
  Stat,
  statusTone,
  useToast,
} from '../components/ui';
import { DriftTrendChart } from '../components/charts';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get<DashboardData>('/api/dashboard'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const seedDemo = async () => {
    setSeeding(true);
    try {
      await api.post('/api/settings?resource=demo', { resource: 'demo' });
      push('success', 'Demo workspace created with three monitoring runs.');
      await load();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Failed to build the demo workspace.');
    } finally {
      setSeeding(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Card>
          <LoadingPanel label="Loading monitoring overview…" rows={4} />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={load} />
      </Card>
    );
  }
  if (!data) return null;

  const t = data.totals;
  const empty = t.projects === 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Reliability overview</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Aggregated from {intf(t.runs)} monitoring run{t.runs === 1 ? '' : 's'} across {intf(t.models)} registered
            model{t.models === 1 ? '' : 's'}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={load} loading={loading}>
            Refresh
          </Button>
          <Link to="/monitoring">
            <Button size="sm" variant="primary">
              <Activity className="h-3.5 w-3.5" />
              New run
            </Button>
          </Link>
        </div>
      </header>

      {empty && (
        <Card>
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="Your workspace is empty"
            description="Load the demonstration workspace to explore a real credit-risk model with three production windows (stable, moderate drift and significant drift), or create your own project and upload datasets."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={seedDemo} loading={seeding}>
                  Load demo workspace
                </Button>
                <Link to="/projects">
                  <Button>Create a project</Button>
                </Link>
              </div>
            }
          />
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Projects"
          value={intf(t.projects)}
          sub={`${intf(t.datasets)} datasets · ${intf(t.rows_monitored)} rows`}
          icon={<Boxes className="h-4 w-4" />}
        />
        <Stat
          label="Healthy models"
          value={intf(t.healthy_models)}
          sub={`${intf(t.unmonitored_models)} never monitored`}
          tone="ok"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <Stat
          label="Drifted models"
          value={intf(t.drifted_models)}
          sub="latest run exceeded thresholds"
          tone={t.drifted_models > 0 ? 'bad' : 'muted'}
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <Stat
          label="Critical alerts"
          value={intf(t.critical_alerts)}
          sub={`${intf(t.open_alerts)} open in total`}
          tone={t.critical_alerts > 0 ? 'crit' : 'muted'}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Drift trend"
            subtitle="Share of monitored features exceeding thresholds, with the primary performance metric overlaid."
            icon={<Activity className="h-4 w-4" />}
          />
          <div className="p-4">
            {data.drift_trend.length ? (
              <DriftTrendChart data={data.drift_trend} />
            ) : (
              <EmptyState title="No monitoring runs yet" description="Execute a run to start building a drift history." />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Alert severity" subtitle="Open alerts by severity band." icon={<BellRing className="h-4 w-4" />} />
          <div className="space-y-3 p-4">
            {data.alert_breakdown.map((b) => (
              <div key={b.severity}>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <Badge tone={statusTone(b.severity)}>{b.severity}</Badge>
                  <span className="tnum text-[13px] text-ink">
                    {b.open}
                    <span className="text-muted"> / {b.total}</span>
                  </span>
                </div>
                <MeterBar value={b.total ? b.open / b.total : 0} tone={statusTone(b.severity)} />
              </div>
            ))}
            <Link to="/alerts" className="mt-2 block">
              <Button size="sm" className="w-full justify-center">
                Review alerts
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Model health"
            subtitle="Status derived from each model's most recent monitoring run."
            icon={<Radar className="h-4 w-4" />}
            action={
              <Link to="/models">
                <Button size="sm" variant="ghost">
                  All models
                </Button>
              </Link>
            }
          />
          {data.model_health.length ? (
            <div className="divide-y divide-[var(--border)]">
              {data.model_health.slice(0, 6).map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/models/${m.id}`} className="truncate text-[13.5px] font-medium text-ink hover:text-accent">
                      {m.name}
                    </Link>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {m.task_type} · {m.last_run_at ? 'last run ' + relativeTime(m.last_run_at) : 'never monitored'}
                    </p>
                  </div>
                  {m.drift_share !== null && (
                    <span className="tnum hidden text-[12.5px] text-muted sm:block">{pf(m.drift_share)} drifted</span>
                  )}
                  <Badge tone={statusTone(m.health)} dot>
                    {STATUS_META[m.health]?.label || m.health}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No models registered" description="Register a model to associate datasets and monitoring runs." />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Most affected features"
            subtitle="Average PSI across the ten most recent runs."
            icon={<Database className="h-4 w-4" />}
          />
          {data.top_features.length ? (
            <div className="divide-y divide-[var(--border)]">
              {data.top_features.map((f) => (
                <div key={f.feature} className="px-5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13.5px] text-ink">{f.feature}</span>
                    <span className="tnum shrink-0 text-[12.5px] text-muted">
                      avg PSI <span className="text-ink">{nf(f.avg_psi, 3)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <MeterBar
                      value={Math.min(1, f.avg_psi / 0.5)}
                      tone={f.avg_psi > 0.2 ? 'crit' : f.avg_psi >= 0.1 ? 'warn' : 'ok'}
                    />
                  </div>
                  <p className="mt-1 text-[11.5px] text-muted">
                    {f.type} · drifted in {Math.round(f.drift_rate * 100)}% of {f.observations} observations · max{' '}
                    {nf(f.max_psi, 3)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No feature statistics yet" description="Feature-level results appear after the first monitoring run." />
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Recent monitoring runs"
            subtitle="Every execution is persisted with its full statistical output."
            action={
              <Link to="/monitoring">
                <Button size="sm" variant="ghost">
                  History
                </Button>
              </Link>
            }
          />
          {data.recent_runs.length ? (
            <div className="divide-y divide-[var(--border)]">
              {data.recent_runs.map((r) => (
                <Link
                  key={r.id}
                  to={`/monitoring/${r.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">{r.name}</p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {r.model_name || 'dataset comparison'} · {dateTime(r.created_at)}
                    </p>
                  </div>
                  <span className="tnum hidden shrink-0 text-[12.5px] text-muted sm:block">
                    {r.drifted_features}/{r.total_features} drifted
                  </span>
                  <Badge tone={statusTone(r.overall_status)} dot>
                    {STATUS_META[r.overall_status]?.label || r.overall_status}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No runs recorded" description="Start a monitoring run from the Monitoring page." />
          )}
        </Card>

        <Card>
          <CardHeader title="Open alerts" subtitle="Most recent unresolved findings." />
          {data.recent_alerts.length ? (
            <div className="divide-y divide-[var(--border)]">
              {data.recent_alerts.map((a) => (
                <div key={a.id} className="px-5 py-3">
                  <div className="flex items-start gap-2">
                    <Badge tone={statusTone(a.severity)}>{a.severity}</Badge>
                    <span className="text-[11px] tracking-wide text-muted uppercase">
                      {ALERT_TYPE_LABEL[a.type] || a.type}
                    </span>
                    <span className="ml-auto shrink-0 text-[11.5px] text-muted">{relativeTime(a.created_at)}</span>
                  </div>
                  <p className="mt-1.5 text-[13px] font-medium text-ink">{a.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted">{a.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No open alerts" description="All monitored models are within configured thresholds." />
          )}
        </Card>
      </div>
    </div>
  );
}

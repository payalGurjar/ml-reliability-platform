import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, Database, Radar } from 'lucide-react';
import { api } from '../lib/api';
import type { Dataset, Model, MonitoringRun, Project } from '../lib/types';
import { bytes, dateTime, intf, pf, relativeTime, STATUS_META } from '../lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, LoadingPanel, statusTone } from '../components/ui';

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [runs, setRuns] = useState<MonitoringRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projects, m, d, r] = await Promise.all([
        api.get<Project[]>('/api/projects'),
        api.get<Model[]>('/api/models', { project_id: id }),
        api.get<Dataset[]>('/api/datasets', { project_id: id }),
        api.get<{ items: MonitoringRun[] }>('/api/monitoring', { project_id: id, page_size: 10 }),
      ]);
      const p = projects.find((x) => String(x.id) === String(id));
      if (!p) throw new Error('Project not found.');
      setProject(p);
      setModels(m);
      setDatasets(d);
      setRuns(r.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the project.');
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
        <LoadingPanel label="Loading project…" rows={5} />
      </Card>
    );
  }
  if (error || !project) {
    return (
      <Card>
        <ErrorState message={error || 'Project not found.'} onRetry={load} />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All projects
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold text-ink">{project.name}</h1>
            <Badge tone="muted">{project.environment}</Badge>
            {project.is_demo && <Badge tone="info">demo data</Badge>}
          </div>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            {project.description || 'No description provided.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/datasets">
            <Button size="sm">Upload dataset</Button>
          </Link>
          <Link to="/monitoring">
            <Button size="sm" variant="primary">
              Run monitoring
            </Button>
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Models" subtitle={`${models.length} registered`} icon={<Radar className="h-4 w-4" />} />
          {models.length ? (
            <div className="divide-y divide-[var(--border)]">
              {models.map((m) => (
                <Link key={m.id} to={`/models/${m.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">{m.name}</p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {m.task_type} · target {m.target_column || '—'} · {m.run_count ?? 0} runs
                    </p>
                  </div>
                  {m.last_status && (
                    <Badge tone={statusTone(m.last_status)} dot>
                      {STATUS_META[m.last_status]?.label || m.last_status}
                    </Badge>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No models" description="Register a model from the Models page to enable performance monitoring." />
          )}
        </Card>

        <Card>
          <CardHeader title="Datasets" subtitle={`${datasets.length} uploaded`} icon={<Database className="h-4 w-4" />} />
          {datasets.length ? (
            <div className="divide-y divide-[var(--border)]">
              {datasets.map((d) => (
                <Link key={d.id} to={`/datasets/${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">{d.name}</p>
                    <p className="tnum mt-0.5 text-[12px] text-muted">
                      {intf(d.row_count)} rows · {d.column_count} cols · {bytes(d.file_size)}
                    </p>
                  </div>
                  <Badge tone={d.kind === 'reference' ? 'info' : 'accent'}>{d.kind}</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No datasets" description="Upload a reference and a production dataset to compute drift." />
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Recent monitoring runs"
          subtitle="Latest executions for this project."
          icon={<Activity className="h-4 w-4" />}
          action={
            <Link to="/monitoring">
              <Button size="sm" variant="ghost">
                Full history
              </Button>
            </Link>
          }
        />
        {runs.length ? (
          <div className="divide-y divide-[var(--border)]">
            {runs.map((r) => (
              <Link key={r.id} to={`/monitoring/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink">{r.name}</p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {dateTime(r.created_at)} · {relativeTime(r.created_at)}
                  </p>
                </div>
                <span className="tnum hidden text-[12.5px] text-muted sm:block">{pf(r.drift_share)} drifted</span>
                <Badge tone={statusTone(r.overall_status)} dot>
                  {STATUS_META[r.overall_status]?.label || r.overall_status}
                </Badge>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No runs yet" description="Execute a monitoring run to compare a production window against your reference." />
        )}
      </Card>
    </div>
  );
}

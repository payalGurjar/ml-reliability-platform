import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, GitBranch, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Model, ModelVersion, MonitoringRun } from '../lib/types';
import { dateTime, nf, pf, relativeTime, STATUS_META } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  InlineError,
  KeyValue,
  LoadingPanel,
  Modal,
  statusTone,
  Textarea,
  Toggle,
  useToast,
} from '../components/ui';
import { DriftTrendChart } from '../components/charts';

export default function ModelDetail() {
  const { id } = useParams();
  const [model, setModel] = useState<Model | null>(null);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [runs, setRuns] = useState<MonitoringRun[]>([]);
  const [trend, setTrend] = useState<{ created_at: string; drift_share: number; metric_value: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ version: '', notes: '', is_active: true });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [models, v, r, t] = await Promise.all([
        api.get<Model[]>('/api/models', { id }),
        api.get<ModelVersion[]>('/api/models', { resource: 'versions', model_id: id }),
        api.get<{ items: MonitoringRun[] }>('/api/monitoring', { model_id: id, page_size: 10 }),
        api.get<{ created_at: string; drift_share: number; metric_value: number | null }[]>('/api/monitoring', {
          resource: 'trend',
          model_id: id,
        }),
      ]);
      if (!models.length) throw new Error('Model not found.');
      setModel(models[0]);
      setVersions(v);
      setRuns(r.items);
      setTrend(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the model.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const addVersion = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.version.trim()) return setFormError('Version label is required.');
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/api/models?resource=versions', { resource: 'versions', model_id: Number(id), ...form });
      push('success', 'Version added.');
      setModal(false);
      setForm({ version: '', notes: '', is_active: true });
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add the version.');
    } finally {
      setSaving(false);
    }
  };

  const deleteVersion = async (vid: number) => {
    try {
      await api.del('/api/models?resource=versions', { resource: 'versions', id: vid });
      push('success', 'Version removed.');
      await load();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Failed to remove the version.');
    }
  };

  if (loading) {
    return (
      <Card>
        <LoadingPanel label="Loading model…" rows={5} />
      </Card>
    );
  }
  if (error || !model) {
    return (
      <Card>
        <ErrorState message={error || 'Model not found.'} onRetry={load} />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/models" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> All models
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-bold text-ink">{model.name}</h1>
            <Badge tone={model.task_type === 'classification' ? 'info' : 'accent'}>{model.task_type}</Badge>
            {model.is_demo && <Badge tone="info">demo</Badge>}
            {model.last_status && (
              <Badge tone={statusTone(model.last_status)} dot>
                {STATUS_META[model.last_status]?.label || model.last_status}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            {model.description || 'No description provided.'}
          </p>
        </div>
        <Link to="/monitoring">
          <Button size="sm" variant="primary">
            Run monitoring
          </Button>
        </Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardHeader title="Configuration" subtitle="Column mapping used by the monitoring engine." />
          <div className="divide-y divide-[var(--border)] px-5 py-2">
            <KeyValue label="Target column" value={model.target_column || 'not set'} mono />
            <KeyValue label="Prediction column" value={model.prediction_column || 'not set'} mono />
            <KeyValue label="Probability column" value={model.probability_column || 'not set'} mono />
            <KeyValue label="Framework" value={model.framework || '—'} />
            <KeyValue label="Owner" value={model.owner || '—'} />
            <KeyValue label="Status" value={model.status} />
            <KeyValue label="Registered" value={dateTime(model.created_at)} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Drift history" subtitle="Share of features drifting per run, with the primary metric." />
          <div className="p-4">
            {trend.length ? (
              <DriftTrendChart data={trend} />
            ) : (
              <EmptyState title="No history" description="Run monitoring to build a trend for this model." />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Versions"
          subtitle={`${versions.length} registered`}
          icon={<GitBranch className="h-4 w-4" />}
          action={
            <Button size="sm" onClick={() => setModal(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add version
            </Button>
          }
        />
        {versions.length ? (
          <div className="divide-y divide-[var(--border)]">
            {versions.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-5 py-3">
                <span className="tnum text-[13.5px] font-medium text-ink">{v.version}</span>
                {v.is_active && <Badge tone="ok">active</Badge>}
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{v.notes || 'No notes.'}</span>
                <span className="shrink-0 text-[11.5px] text-muted">{relativeTime(v.created_at)}</span>
                <button
                  onClick={() => deleteVersion(v.id)}
                  aria-label="Delete version"
                  className="rounded p-1.5 text-muted transition-colors hover:bg-crit-soft hover:text-crit"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No versions" description="Track model releases so drift findings can be attributed to a deployment." />
        )}
      </Card>

      <Card>
        <CardHeader title="Monitoring runs" subtitle="Most recent executions for this model." />
        {runs.length ? (
          <div className="divide-y divide-[var(--border)]">
            {runs.map((r) => (
              <Link key={r.id} to={`/monitoring/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink">{r.name}</p>
                  <p className="mt-0.5 text-[12px] text-muted">{dateTime(r.created_at)}</p>
                </div>
                {r.performance?.comparison && (
                  <span className="tnum hidden text-[12.5px] text-muted md:block">
                    {r.performance.comparison.metric}: {nf(r.performance.comparison.current, 4)}
                  </span>
                )}
                <span className="tnum hidden text-[12.5px] text-muted sm:block">{pf(r.drift_share)} drifted</span>
                <Badge tone={statusTone(r.overall_status)} dot>
                  {STATUS_META[r.overall_status]?.label || r.overall_status}
                </Badge>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No runs" description="Execute a monitoring run to evaluate this model." />
        )}
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Add model version"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={addVersion} loading={saving}>
              Add version
            </Button>
          </>
        }
      >
        <form onSubmit={addVersion} className="space-y-4">
          <Field label="Version" required>
            <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="v1.4.2" />
          </Field>
          <Field label="Notes">
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="flex items-center justify-between rounded-md border border-line bg-surface-2 px-3 py-2.5">
            <div>
              <p className="text-[13px] font-medium text-ink">Mark as active</p>
              <p className="text-[12px] text-muted">Deactivates the currently active version.</p>
            </div>
            <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Active version" />
          </div>
          {formError && <InlineError message={formError} />}
        </form>
      </Modal>
    </div>
  );
}

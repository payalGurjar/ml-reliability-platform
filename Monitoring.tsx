import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, GitCompare, Play, Search, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Dataset, Model, MonitoringRun, Project } from '../lib/types';
import { dateTime, nf, pf, relativeTime, STATUS_META } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  InlineError,
  LoadingPanel,
  Modal,
  Note,
  Pagination,
  Select,
  statusTone,
  useToast,
} from '../components/ui';

const PAGE_SIZE = 10;

export default function Monitoring() {
  const [runs, setRuns] = useState<MonitoringRun[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [runModal, setRunModal] = useState(false);
  const [compareModal, setCompareModal] = useState(false);
  const [confirm, setConfirm] = useState<MonitoringRun | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { push } = useToast();
  const navigate = useNavigate();

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items: MonitoringRun[]; total: number }>('/api/monitoring', {
        page,
        page_size: PAGE_SIZE,
        search: search.trim() || undefined,
        overall_status: statusFilter || undefined,
        project_id: projectFilter || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
      });
      setRuns(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitoring runs.');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, projectFilter, from, to]);

  const loadMeta = useCallback(async () => {
    try {
      const [p, m, d] = await Promise.all([
        api.get<Project[]>('/api/projects'),
        api.get<Model[]>('/api/models'),
        api.get<Dataset[]>('/api/datasets'),
      ]);
      setProjects(p);
      setModels(m);
      setDatasets(d);
    } catch {
      /* filters degrade gracefully */
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    const t = setTimeout(loadRuns, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadRuns, search]);

  const remove = async () => {
    if (!confirm) return;
    setDeleting(true);
    try {
      await api.del('/api/monitoring', { id: confirm.id });
      push('success', 'Monitoring run deleted.');
      setConfirm(null);
      await loadRuns();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Failed to delete the run.');
    } finally {
      setDeleting(false);
    }
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setProjectFilter('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const hasFilters = search || statusFilter || projectFilter || from || to;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Monitoring</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Every execution stores its full statistical output — drift per feature, performance, alerts and config.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setCompareModal(true)} disabled={runs.length < 2}>
            <GitCompare className="h-3.5 w-3.5" />
            Compare runs
          </Button>
          <Button size="sm" variant="primary" onClick={() => setRunModal(true)} disabled={datasets.length < 2}>
            <Play className="h-3.5 w-3.5" />
            New run
          </Button>
        </div>
      </header>

      {datasets.length < 2 && (
        <Note tone="warn">
          At least two datasets are required to run a comparison (one reference, one production window).{' '}
          <Link to="/datasets" className="underline">
            Upload datasets
          </Link>
          .
        </Note>
      )}

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[190px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              placeholder="Search run name…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            className="w-auto min-w-[140px]"
            value={projectFilter}
            onChange={(e) => {
              setProjectFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select
            className="w-auto min-w-[130px]"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="healthy">Healthy</option>
            <option value="warning">Watch</option>
            <option value="drifted">Drifted</option>
            <option value="critical">Critical</option>
          </Select>
          <Input
            type="date"
            className="w-auto"
            value={from}
            aria-label="From date"
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            type="date"
            className="w-auto"
            value={to}
            aria-label="To date"
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
          {hasFilters && (
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              Clear
            </Button>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingPanel label="Loading monitoring history…" rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={loadRuns} />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-5 w-5" />}
            title={hasFilters ? 'No runs match your filters' : 'No monitoring runs yet'}
            description={
              hasFilters
                ? 'Try widening the date range or clearing the filters.'
                : 'Select a reference and a production dataset and execute your first run.'
            }
            action={
              hasFilters ? (
                <Button size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              ) : datasets.length >= 2 ? (
                <Button variant="primary" onClick={() => setRunModal(true)}>
                  Run monitoring
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-[11px] tracking-wider text-muted uppercase">
                    <th className="px-5 py-2.5 font-medium">Run</th>
                    <th className="px-3 py-2.5 font-medium">Model</th>
                    <th className="px-3 py-2.5 font-medium">Drift</th>
                    <th className="px-3 py-2.5 font-medium">Performance</th>
                    <th className="px-3 py-2.5 font-medium">Concept</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Executed</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {runs.map((r) => (
                    <tr key={r.id} className="transition-colors hover:bg-surface-2">
                      <td className="px-5 py-3">
                        <Link to={`/monitoring/${r.id}`} className="text-[13.5px] font-medium text-ink hover:text-accent">
                          {r.name}
                        </Link>
                        <p className="mt-0.5 text-[12px] text-muted">
                          {r.project_name || '—'}
                          {r.is_demo && <span className="ml-1.5 text-info">· demo</span>}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-[12.5px] text-ink-dim">{r.model_name || '—'}</td>
                      <td className="tnum px-3 py-3 text-[12.5px] text-ink-dim">
                        {r.drifted_features}/{r.total_features}
                        <div className="text-[11.5px] text-muted">{pf(r.drift_share)}</div>
                      </td>
                      <td className="tnum px-3 py-3 text-[12.5px] text-ink-dim">
                        {r.performance?.comparison ? (
                          <>
                            {r.performance.comparison.metric}: {nf(r.performance.comparison.current, 4)}
                            <div
                              className={
                                'text-[11.5px] ' + (r.performance.comparison.degraded ? 'text-crit' : 'text-muted')
                              }
                            >
                              {r.performance.comparison.relative >= 0 ? '+' : ''}
                              {(r.performance.comparison.relative * 100).toFixed(1)}%
                            </div>
                          </>
                        ) : (
                          <span className="text-muted">not evaluated</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {r.concept_drift?.evaluated ? (
                          <Badge tone={r.concept_drift.detected ? 'bad' : 'ok'}>
                            {r.concept_drift.detected ? r.concept_drift.type.replace(/_/g, ' ') : 'stable'}
                          </Badge>
                        ) : (
                          <Badge>no labels</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={statusTone(r.overall_status)} dot>
                          {STATUS_META[r.overall_status]?.label || r.overall_status}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-[12px] text-muted">
                        {relativeTime(r.created_at)}
                        <div className="tnum text-[11.5px]">{r.duration_ms} ms</div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => setConfirm(r)}
                          aria-label="Delete run"
                          className="rounded p-1.5 text-muted transition-colors hover:bg-crit-soft hover:text-crit"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
          </>
        )}
      </Card>

      <RunModal
        open={runModal}
        onClose={() => setRunModal(false)}
        projects={projects}
        models={models}
        datasets={datasets}
        onDone={(id) => {
          setRunModal(false);
          navigate(`/monitoring/${id}`);
        }}
      />

      <CompareModal open={compareModal} onClose={() => setCompareModal(false)} runs={runs} />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        busy={deleting}
        title="Delete monitoring run"
        message={`"${confirm?.name}" and all of its drift results, performance records, AI analyses and alerts will be permanently deleted.`}
      />
    </div>
  );
}

/* ----------------------------- Run execution ----------------------------- */

function RunModal({
  open,
  onClose,
  projects,
  models,
  datasets,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  models: Model[];
  datasets: Dataset[];
  onDone: (runId: number) => void;
}) {
  const [projectId, setProjectId] = useState('');
  const [modelId, setModelId] = useState('');
  const [refId, setRefId] = useState('');
  const [curId, setCurId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const { push } = useToast();

  useEffect(() => {
    if (open && !projectId && projects.length) setProjectId(String(projects[0].id));
  }, [open, projects, projectId]);

  const scopedDatasets = useMemo(
    () => datasets.filter((d) => !projectId || String(d.project_id) === projectId),
    [datasets, projectId],
  );
  const scopedModels = useMemo(
    () => models.filter((m) => !projectId || String(m.project_id) === projectId),
    [models, projectId],
  );

  const selectedModel = scopedModels.find((m) => String(m.id) === modelId);

  const execute = async () => {
    if (!refId || !curId) return setError('Select both a reference and a production dataset.');
    if (refId === curId) return setError('The reference and production datasets must differ.');
    setRunning(true);
    setError(null);
    try {
      const res = await api.post<{ run: MonitoringRun; alerts_created: number }>('/api/monitoring', {
        project_id: projectId ? Number(projectId) : undefined,
        model_id: modelId ? Number(modelId) : undefined,
        reference_dataset_id: Number(refId),
        current_dataset_id: Number(curId),
        name: name.trim() || undefined,
      });
      push(
        'success',
        `Run complete — ${res.run.drifted_features}/${res.run.total_features} features drifted, ${res.alerts_created} alert(s) raised.`,
      );
      onDone(res.run.id);
      setRefId('');
      setCurId('');
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The monitoring run failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Execute monitoring run"
      description="Compares two datasets with real statistical tests and stores every result."
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button variant="primary" onClick={execute} loading={running}>
            {running ? 'Computing…' : 'Run analysis'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project" required>
            <Select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setModelId('');
                setRefId('');
                setCurId('');
              }}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Model" hint="Required for performance and concept drift.">
            <Select value={modelId} onChange={(e) => setModelId(e.target.value)}>
              <option value="">No model (data drift only)</option>
              {scopedModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.task_type})
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reference dataset" required hint="Baseline distribution.">
            <Select value={refId} onChange={(e) => setRefId(e.target.value)}>
              <option value="">Select dataset</option>
              {scopedDatasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.kind}, {d.row_count} rows)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Production dataset" required hint="Window under test.">
            <Select value={curId} onChange={(e) => setCurId(e.target.value)}>
              <option value="">Select dataset</option>
              {scopedDatasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.kind}, {d.row_count} rows)
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Run name" hint="Optional — generated automatically if left blank.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekly check — week 46" />
        </Field>

        {selectedModel ? (
          <Note tone="info">
            Using <span className="tnum">{selectedModel.target_column || 'no target'}</span> as ground truth and{' '}
            <span className="tnum">{selectedModel.prediction_column || 'no prediction'}</span> as the model output.
            {selectedModel.probability_column
              ? ' ROC-AUC will be computed from ' + selectedModel.probability_column + '.'
              : ' ROC-AUC requires a probability column and will be omitted.'}
          </Note>
        ) : (
          <Note tone="warn">
            Without a model the run computes data drift only. Performance metrics and concept drift will be reported as
            “not evaluated”.
          </Note>
        )}

        <Note>
          Thresholds come from your settings (PSI bands, KS/chi-square alpha, JS threshold). Adjust them in{' '}
          <Link to="/settings" className="underline">
            Settings
          </Link>
          .
        </Note>

        {error && <InlineError message={error} />}
      </div>
    </Modal>
  );
}

/* ------------------------------- Comparison ------------------------------- */

interface CompareResult {
  a: MonitoringRun;
  b: MonitoringRun;
  features: { feature: string; a_psi: number | null; b_psi: number | null; delta: number | null; a_status: string | null; b_status: string | null }[];
}

function CompareModal({ open, onClose, runs }: { open: boolean; onClose: () => void; runs: MonitoringRun[] }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && runs.length >= 2) {
      setA(String(runs[1].id));
      setB(String(runs[0].id));
      setResult(null);
      setError(null);
    }
  }, [open, runs]);

  const compare = async () => {
    if (!a || !b || a === b) return setError('Select two different runs.');
    setLoading(true);
    setError(null);
    try {
      setResult(await api.get<CompareResult>('/api/monitoring', { compare: 1, a, b }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Compare monitoring runs" width="max-w-3xl">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Baseline run">
            <Select value={a} onChange={(e) => setA(e.target.value)}>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {dateTime(r.created_at)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Comparison run">
            <Select value={b} onChange={(e) => setB(e.target.value)}>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {dateTime(r.created_at)}
                </option>
              ))}
            </Select>
          </Field>
          <Button variant="primary" onClick={compare} loading={loading}>
            Compare
          </Button>
        </div>

        {error && <InlineError message={error} />}

        {result && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {[result.a, result.b].map((r, i) => (
                <Card key={r.id} className="p-3.5">
                  <p className="text-[11px] tracking-wider text-muted uppercase">{i === 0 ? 'baseline' : 'comparison'}</p>
                  <p className="mt-1 truncate text-[13.5px] font-medium text-ink">{r.name}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone={statusTone(r.overall_status)} dot>
                      {STATUS_META[r.overall_status]?.label || r.overall_status}
                    </Badge>
                    <span className="tnum text-[12.5px] text-muted">
                      {r.drifted_features}/{r.total_features} drifted ({pf(r.drift_share)})
                    </span>
                  </div>
                </Card>
              ))}
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border border-line">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-surface-2">
                  <tr className="border-b border-line text-[11px] tracking-wider text-muted uppercase">
                    <th className="px-4 py-2 font-medium">Feature</th>
                    <th className="px-3 py-2 font-medium">Baseline PSI</th>
                    <th className="px-3 py-2 font-medium">Comparison PSI</th>
                    <th className="px-4 py-2 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {result.features.map((f) => (
                    <tr key={f.feature}>
                      <td className="px-4 py-2 text-[13px] text-ink">{f.feature}</td>
                      <td className="tnum px-3 py-2 text-[12.5px] text-ink-dim">{nf(f.a_psi, 4)}</td>
                      <td className="tnum px-3 py-2 text-[12.5px] text-ink-dim">{nf(f.b_psi, 4)}</td>
                      <td className="px-4 py-2">
                        {f.delta === null ? (
                          <span className="text-[12.5px] text-muted">—</span>
                        ) : (
                          <span
                            className={
                              'tnum text-[12.5px] ' +
                              (f.delta > 0.01 ? 'text-crit' : f.delta < -0.01 ? 'text-ok' : 'text-muted')
                            }
                          >
                            {f.delta > 0 ? '+' : ''}
                            {f.delta.toFixed(4)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

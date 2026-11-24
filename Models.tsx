import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Radar, Search, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Model, Project, TaskType } from '../lib/types';
import { pf, relativeTime, STATUS_META } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  InlineError,
  LoadingPanel,
  Modal,
  Note,
  Select,
  statusTone,
  Textarea,
  useToast,
} from '../components/ui';

interface FormState {
  project_id: string;
  name: string;
  description: string;
  task_type: TaskType;
  target_column: string;
  prediction_column: string;
  probability_column: string;
  framework: string;
  owner: string;
  version: string;
}

const BLANK: FormState = {
  project_id: '',
  name: '',
  description: '',
  task_type: 'classification',
  target_column: '',
  prediction_column: '',
  probability_column: '',
  framework: '',
  owner: '',
  version: 'v1.0.0',
};

export default function Models() {
  const [models, setModels] = useState<Model[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [modal, setModal] = useState<{ open: boolean; edit: Model | null }>({ open: false, edit: null });
  const [form, setForm] = useState<FormState>(BLANK);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<Model | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, p] = await Promise.all([api.get<Model[]>('/api/models'), api.get<Project[]>('/api/projects')]);
      setModels(m);
      setProjects(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load models.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const openCreate = () => {
    setForm({ ...BLANK, project_id: projects[0] ? String(projects[0].id) : '' });
    setFormError(null);
    setModal({ open: true, edit: null });
  };

  const openEdit = (m: Model) => {
    setForm({
      project_id: String(m.project_id),
      name: m.name,
      description: m.description || '',
      task_type: m.task_type,
      target_column: m.target_column || '',
      prediction_column: m.prediction_column || '',
      probability_column: m.probability_column || '',
      framework: m.framework || '',
      owner: m.owner || '',
      version: '',
    });
    setFormError(null);
    setModal({ open: true, edit: m });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setFormError('Model name is required.');
    if (!form.project_id) return setFormError('Select a project for this model.');
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        ...form,
        project_id: Number(form.project_id),
        target_column: form.target_column.trim() || null,
        prediction_column: form.prediction_column.trim() || null,
        probability_column: form.probability_column.trim() || null,
      };
      if (modal.edit) {
        await api.put('/api/models', { id: modal.edit.id, ...payload });
        push('success', 'Model updated.');
      } else {
        await api.post('/api/models', payload);
        push('success', 'Model registered.');
      }
      setModal({ open: false, edit: null });
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save the model.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm) return;
    setDeleting(true);
    try {
      await api.del('/api/models', { id: confirm.id });
      push('success', 'Model deleted.');
      setConfirm(null);
      await load();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Failed to delete the model.');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = models.filter((m) => {
    if (taskFilter && m.task_type !== taskFilter) return false;
    if (projectFilter && String(m.project_id) !== projectFilter) return false;
    if (search.trim() && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Models</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Register classification and regression models with their target, prediction and probability columns.
          </p>
        </div>
        <Button size="sm" variant="primary" onClick={openCreate} disabled={!projects.length}>
          <Plus className="h-3.5 w-3.5" />
          Register model
        </Button>
      </header>

      {!projects.length && !loading && (
        <Note tone="warn">
          Create a project first — every model must belong to one. <Link to="/projects" className="underline">Go to projects</Link>.
        </Note>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search models…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="w-auto min-w-[150px]" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select className="w-auto min-w-[150px]" value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)}>
          <option value="">All task types</option>
          <option value="classification">Classification</option>
          <option value="regression">Regression</option>
        </Select>
      </div>

      {loading ? (
        <Card>
          <LoadingPanel label="Loading models…" />
        </Card>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Radar className="h-5 w-5" />}
            title={models.length ? 'No models match your filters' : 'No models registered'}
            description={
              models.length
                ? 'Adjust the search or filters above.'
                : 'Register a model so monitoring runs can evaluate performance and concept drift.'
            }
            action={
              models.length ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setTaskFilter('');
                    setProjectFilter('');
                  }}
                >
                  Clear filters
                </Button>
              ) : projects.length ? (
                <Button variant="primary" onClick={openCreate}>
                  Register model
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-[11px] tracking-wider text-muted uppercase">
                  <th className="px-5 py-2.5 font-medium">Model</th>
                  <th className="px-3 py-2.5 font-medium">Task</th>
                  <th className="px-3 py-2.5 font-medium">Columns</th>
                  <th className="px-3 py-2.5 font-medium">Version</th>
                  <th className="px-3 py-2.5 font-medium">Last run</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-surface-2">
                    <td className="px-5 py-3">
                      <Link to={`/models/${m.id}`} className="text-[13.5px] font-medium text-ink hover:text-accent">
                        {m.name}
                      </Link>
                      <p className="mt-0.5 text-[12px] text-muted">{projectName.get(m.project_id) || '—'}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={m.task_type === 'classification' ? 'info' : 'accent'}>{m.task_type}</Badge>
                    </td>
                    <td className="tnum px-3 py-3 text-[12px] text-muted">
                      <div>y: {m.target_column || '—'}</div>
                      <div>ŷ: {m.prediction_column || '—'}</div>
                    </td>
                    <td className="tnum px-3 py-3 text-[12.5px] text-ink-dim">{m.active_version || '—'}</td>
                    <td className="px-3 py-3 text-[12.5px] text-muted">
                      {m.last_run_at ? (
                        <>
                          {relativeTime(m.last_run_at)}
                          <div className="tnum text-[11.5px]">{pf(m.last_drift_share)} drifted</div>
                        </>
                      ) : (
                        'never'
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {m.last_status ? (
                        <Badge tone={statusTone(m.last_status)} dot>
                          {STATUS_META[m.last_status]?.label || m.last_status}
                        </Badge>
                      ) : (
                        <Badge>no runs</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-0.5">
                        <button
                          onClick={() => openEdit(m)}
                          aria-label="Edit model"
                          className="rounded p-1.5 text-muted transition-colors hover:bg-surface-3 hover:text-ink"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirm(m)}
                          aria-label="Delete model"
                          className="rounded p-1.5 text-muted transition-colors hover:bg-crit-soft hover:text-crit"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, edit: null })}
        title={modal.edit ? 'Edit model' : 'Register model'}
        description="Column names must match the headers in your uploaded datasets."
        width="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal({ open: false, edit: null })} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {modal.edit ? 'Save changes' : 'Register'}
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project" required>
              <Select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                <option value="">Select a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Name" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="churn-propensity" />
            </Field>
          </div>

          <Field label="Description">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>

          <Field label="Task type" required>
            <Select value={form.task_type} onChange={(e) => setForm({ ...form, task_type: e.target.value as TaskType })}>
              <option value="classification">Classification</option>
              <option value="regression">Regression</option>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Target column" hint="Ground truth">
              <Input value={form.target_column} onChange={(e) => setForm({ ...form, target_column: e.target.value })} placeholder="churned" />
            </Field>
            <Field label="Prediction column" hint="Model output">
              <Input value={form.prediction_column} onChange={(e) => setForm({ ...form, prediction_column: e.target.value })} placeholder="predicted" />
            </Field>
            <Field
              label="Probability column"
              hint={form.task_type === 'classification' ? 'Enables ROC-AUC' : 'Not used for regression'}
            >
              <Input
                value={form.probability_column}
                onChange={(e) => setForm({ ...form, probability_column: e.target.value })}
                placeholder="score"
                disabled={form.task_type === 'regression'}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Framework">
              <Input value={form.framework} onChange={(e) => setForm({ ...form, framework: e.target.value })} placeholder="XGBoost 2.0" />
            </Field>
            <Field label="Owner">
              <Input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} placeholder="Data Science" />
            </Field>
            {!modal.edit && (
              <Field label="Initial version">
                <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="v1.0.0" />
              </Field>
            )}
          </div>

          <Note>
            Target and prediction columns are optional. Without them the platform still computes data drift, but
            performance metrics and concept drift cannot be evaluated — and will be reported as not evaluated rather
            than estimated.
          </Note>

          {formError && <InlineError message={formError} />}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        busy={deleting}
        title="Delete model"
        message={`"${confirm?.name}" and all of its versions, monitoring runs, drift results and alerts will be permanently deleted.`}
      />
    </div>
  );
}

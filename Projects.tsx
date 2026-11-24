import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Database, Pencil, Plus, Radar, Search, Sparkles, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Project } from '../lib/types';
import { dateTime, relativeTime, STATUS_META } from '../lib/format';
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
  Select,
  statusTone,
  Textarea,
  useToast,
} from '../components/ui';

const BLANK = { name: '', description: '', environment: 'production' };

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; edit: Project | null }>({ open: false, edit: null });
  const [form, setForm] = useState(BLANK);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await api.get<Project[]>('/api/projects'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(BLANK);
    setFormError(null);
    setModal({ open: true, edit: null });
  };
  const openEdit = (p: Project) => {
    setForm({ name: p.name, description: p.description || '', environment: p.environment || 'production' });
    setFormError(null);
    setModal({ open: true, edit: p });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Project name is required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (modal.edit) {
        await api.put('/api/projects', { id: modal.edit.id, ...form });
        push('success', 'Project updated.');
      } else {
        await api.post('/api/projects', form);
        push('success', 'Project created.');
      }
      setModal({ open: false, edit: null });
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save the project.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm) return;
    setDeleting(true);
    try {
      await api.del('/api/projects', { id: confirm.id });
      push('success', 'Project and all associated data deleted.');
      setConfirm(null);
      await load();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Failed to delete the project.');
    } finally {
      setDeleting(false);
    }
  };

  const seedDemo = async () => {
    setSeeding(true);
    try {
      await api.post('/api/settings?resource=demo', { resource: 'demo' });
      push('success', 'Demo workspace created.');
      await load();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Failed to create the demo workspace.');
    } finally {
      setSeeding(false);
    }
  };

  const filtered = projects.filter(
    (p) =>
      !search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Projects</h1>
          <p className="mt-1 text-[13.5px] text-muted">Group models, datasets and monitoring runs by product or team.</p>
        </div>
        <div className="flex gap-2">
          {!projects.some((p) => p.is_demo) && (
            <Button size="sm" onClick={seedDemo} loading={seeding}>
              <Sparkles className="h-3.5 w-3.5" />
              Demo workspace
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            New project
          </Button>
        </div>
      </header>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <Input
          className="pl-9"
          placeholder="Search projects…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <Card>
          <LoadingPanel label="Loading projects…" />
        </Card>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title={search ? 'No projects match your search' : 'No projects yet'}
            description={
              search
                ? 'Try a different search term.'
                : 'Create a project to register models and upload reference and production datasets.'
            }
            action={
              search ? (
                <Button size="sm" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="primary" onClick={openCreate}>
                    Create project
                  </Button>
                  <Button onClick={seedDemo} loading={seeding}>
                    Load demo
                  </Button>
                </div>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <Card key={p.id} className="rise flex flex-col p-4 transition-colors hover:border-line-strong">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to={`/projects/${p.id}`} className="block truncate text-[15px] font-semibold text-ink hover:text-accent">
                    {p.name}
                  </Link>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone="muted">{p.environment}</Badge>
                    {p.is_demo && <Badge tone="info">demo data</Badge>}
                    {p.last_status && (
                      <Badge tone={statusTone(p.last_status)} dot>
                        {STATUS_META[p.last_status]?.label || p.last_status}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <button
                    onClick={() => openEdit(p)}
                    aria-label="Edit project"
                    className="rounded p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirm(p)}
                    aria-label="Delete project"
                    className="rounded p-1.5 text-muted transition-colors hover:bg-crit-soft hover:text-crit"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <p className="mt-2.5 line-clamp-2 min-h-[2.4em] text-[13px] leading-snug text-muted">
                {p.description || 'No description provided.'}
              </p>

              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
                <Metric icon={<Radar className="h-3 w-3" />} label="models" value={p.model_count ?? 0} />
                <Metric icon={<Database className="h-3 w-3" />} label="datasets" value={p.dataset_count ?? 0} />
                <Metric icon={<Boxes className="h-3 w-3" />} label="runs" value={p.run_count ?? 0} />
              </div>
              <p className="mt-2.5 text-[11.5px] text-muted">
                {p.last_run_at ? 'Last run ' + relativeTime(p.last_run_at) : 'Created ' + dateTime(p.created_at)}
              </p>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, edit: null })}
        title={modal.edit ? 'Edit project' : 'New project'}
        description={modal.edit ? 'Update the project metadata.' : 'Projects scope models, datasets and runs.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal({ open: false, edit: null })} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              {modal.edit ? 'Save changes' : 'Create project'}
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-4">
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Fraud detection" />
          </Field>
          <Field label="Description" hint="Optional context for your team.">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Card-not-present fraud models for the EU region."
            />
          </Field>
          <Field label="Environment">
            <Select value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}>
              <option value="production">production</option>
              <option value="staging">staging</option>
              <option value="development">development</option>
            </Select>
          </Field>
          {formError && <InlineError message={formError} />}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        busy={deleting}
        title="Delete project"
        message={`"${confirm?.name}" and all of its models, datasets, monitoring runs, drift results and alerts will be permanently deleted. This cannot be undone.`}
      />
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-muted">
        {icon}
        <span className="text-[10.5px] tracking-wider uppercase">{label}</span>
      </div>
      <p className="tnum mt-0.5 text-[16px] font-semibold text-ink">{value}</p>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, Download, Search, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api';
import type { Dataset, Model, Project } from '../lib/types';
import { bytes, dateTime, intf, nf } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingPanel,
  Note,
  Select,
  useToast,
} from '../components/ui';
import UploadDataset from '../components/UploadDataset';

const SAMPLES: { file: string; tag: string; title: string; body: string; tone: 'info' | 'ok' | 'warn' | 'crit' }[] = [
  {
    file: 'reference_training_window.csv',
    tag: 'reference',
    title: 'Training reference',
    body: 'Labelled baseline window. Upload this first with the role set to Reference.',
    tone: 'info',
  },
  {
    file: 'production_no_drift.csv',
    tag: 'no drift',
    title: 'Stable production window',
    body: 'Same population as the reference. Expect a healthy verdict with 0 drifted features.',
    tone: 'ok',
  },
  {
    file: 'production_moderate_drift.csv',
    tag: 'moderate',
    title: 'Moderate drift',
    body: 'Marketing-mix change: younger, higher-utilisation applicants. Expect ~45% of features drifting.',
    tone: 'warn',
  },
  {
    file: 'production_significant_drift.csv',
    tag: 'significant',
    title: 'Significant drift',
    body: 'Pipeline change with a new channel, a new device category, an income-feed outage and real performance loss.',
    tone: 'crit',
  },
];

export default function Datasets() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [upload, setUpload] = useState(false);
  const [confirm, setConfirm] = useState<Dataset | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, p, m] = await Promise.all([
        api.get<Dataset[]>('/api/datasets'),
        api.get<Project[]>('/api/projects'),
        api.get<Model[]>('/api/models'),
      ]);
      setDatasets(d);
      setProjects(p);
      setModels(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load datasets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const remove = async () => {
    if (!confirm) return;
    setDeleting(true);
    try {
      await api.del('/api/datasets', { id: confirm.id });
      push('success', 'Dataset deleted.');
      setConfirm(null);
      await load();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Failed to delete the dataset.');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = datasets.filter((d) => {
    if (kindFilter && d.kind !== kindFilter) return false;
    if (projectFilter && String(d.project_id) !== projectFilter) return false;
    if (search.trim() && !d.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Datasets</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Reference, production, prediction and ground-truth windows with schema profiling and validation.
          </p>
        </div>
        <Button size="sm" variant="primary" onClick={() => setUpload(true)} disabled={!projects.length}>
          <Upload className="h-3.5 w-3.5" />
          Upload dataset
        </Button>
      </header>

      {!projects.length && !loading && (
        <Note tone="warn">
          Create a project before uploading data. <Link to="/projects" className="underline">Go to projects</Link>.
        </Note>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search datasets…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select className="w-auto min-w-[150px]" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select className="w-auto min-w-[150px]" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
          <option value="">All roles</option>
          <option value="reference">Reference</option>
          <option value="production">Production</option>
          <option value="prediction">Predictions</option>
          <option value="ground_truth">Ground truth</option>
        </Select>
      </div>

      {loading ? (
        <Card>
          <LoadingPanel label="Loading datasets…" />
        </Card>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={load} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Database className="h-5 w-5" />}
            title={datasets.length ? 'No datasets match your filters' : 'No datasets uploaded'}
            description={
              datasets.length
                ? 'Adjust the search or filters above.'
                : 'Upload a reference window and a production window to compute drift between them.'
            }
            action={
              datasets.length ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setKindFilter('');
                    setProjectFilter('');
                  }}
                >
                  Clear filters
                </Button>
              ) : projects.length ? (
                <Button variant="primary" onClick={() => setUpload(true)}>
                  Upload dataset
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-[11px] tracking-wider text-muted uppercase">
                  <th className="px-5 py-2.5 font-medium">Dataset</th>
                  <th className="px-3 py-2.5 font-medium">Role</th>
                  <th className="px-3 py-2.5 font-medium">Shape</th>
                  <th className="px-3 py-2.5 font-medium">Missing</th>
                  <th className="px-3 py-2.5 font-medium">Duplicates</th>
                  <th className="px-3 py-2.5 font-medium">Validation</th>
                  <th className="px-3 py-2.5 font-medium">Uploaded</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filtered.map((d) => (
                  <tr key={d.id} className="transition-colors hover:bg-surface-2">
                    <td className="px-5 py-3">
                      <Link to={`/datasets/${d.id}`} className="text-[13.5px] font-medium text-ink hover:text-accent">
                        {d.name}
                      </Link>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {projectName.get(d.project_id) || '—'}
                        {d.is_demo && <span className="ml-1.5 text-info">· demo</span>}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={d.kind === 'reference' ? 'info' : d.kind === 'production' ? 'accent' : 'muted'}>
                        {d.kind.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="tnum px-3 py-3 text-[12.5px] text-ink-dim">
                      {intf(d.row_count)} × {d.column_count}
                      <div className="text-[11.5px] text-muted">{bytes(d.file_size)}</div>
                    </td>
                    <td className="tnum px-3 py-3 text-[12.5px] text-ink-dim">{nf(d.quality?.missing_pct, 2)}%</td>
                    <td className="tnum px-3 py-3 text-[12.5px] text-ink-dim">{intf(d.quality?.duplicate_rows ?? 0)}</td>
                    <td className="px-3 py-3">
                      {d.validation?.passed ? (
                        <Badge tone="ok">passed</Badge>
                      ) : (
                        <Badge tone="bad">{d.validation?.issues?.length ?? 0} issues</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[12px] text-muted">{dateTime(d.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setConfirm(d)}
                        aria-label="Delete dataset"
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
        </Card>
      )}

      <Card>
        <div className="border-b border-line px-5 py-4">
          <h3 className="text-[15px] font-semibold text-ink">Sample datasets</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            Deterministic synthetic consumer-credit data (1,000 rows, 14 columns). Download a reference window plus one
            of three production windows, then upload them above to run a real comparison.
          </p>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {SAMPLES.map((s) => (
            <a
              key={s.file}
              href={'/sample-data/' + s.file}
              download
              className="group rounded-lg border border-line bg-surface-2 p-3.5 transition-colors hover:border-line-strong"
            >
              <div className="flex items-start justify-between gap-2">
                <Badge tone={s.tone}>{s.tag}</Badge>
                <Download className="h-3.5 w-3.5 text-muted transition-colors group-hover:text-accent" />
              </div>
              <p className="mt-2 text-[13.5px] font-medium text-ink">{s.title}</p>
              <p className="mt-1 text-[12px] leading-snug text-muted">{s.body}</p>
            </a>
          ))}
        </div>
      </Card>

      <UploadDataset
        open={upload}
        onClose={() => setUpload(false)}
        onUploaded={load}
        projects={projects}
        models={models}
      />

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        busy={deleting}
        title="Delete dataset"
        message={`"${confirm?.name}" will be permanently removed. Monitoring runs that referenced it keep their stored results.`}
      />
    </div>
  );
}

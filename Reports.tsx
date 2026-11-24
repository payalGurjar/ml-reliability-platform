import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileSpreadsheet, FileText, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { MonitoringRun, ReportRecord } from '../lib/types';
import { dateTime, pf, relativeTime, STATUS_META } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingPanel,
  Pagination,
  statusTone,
  useToast,
} from '../components/ui';
import { exportCsv, exportPdf } from '../lib/report';

const PAGE_SIZE = 15;

export default function Reports() {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [runs, setRuns] = useState<MonitoringRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ReportRecord | null>(null);
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, runRes] = await Promise.all([
        api.get<{ items: ReportRecord[]; total: number }>('/api/reports', { page, page_size: PAGE_SIZE }),
        api.get<{ items: MonitoringRun[] }>('/api/monitoring', { page_size: 12 }),
      ]);
      setReports(r.items);
      setTotal(r.total);
      setRuns(runRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async (runId: number, format: 'pdf' | 'csv') => {
    setBusy(runId + format);
    try {
      const file = format === 'pdf' ? await exportPdf(runId) : await exportCsv(runId);
      push('success', 'Downloaded ' + file);
      await load();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Report generation failed.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!confirm) return;
    setBusy('delete');
    try {
      await api.del('/api/reports', { id: confirm.id });
      push('success', 'Report record removed.');
      setConfirm(null);
      await load();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Failed to remove the record.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[22px] font-bold text-ink">Reports</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Downloadable PDF and CSV reports containing the dataset comparison, drift results, model metrics, AI analysis,
          alerts and recommendations.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Generate a report"
          subtitle="Pick a monitoring run — the report is assembled from its stored results."
          icon={<FileText className="h-4 w-4" />}
        />
        {loading ? (
          <LoadingPanel label="Loading runs…" rows={3} />
        ) : runs.length === 0 ? (
          <EmptyState
            title="No monitoring runs available"
            description="Execute a monitoring run first — reports are generated from stored run results."
            action={
              <Link to="/monitoring">
                <Button variant="primary">Go to monitoring</Button>
              </Link>
            }
          />
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {runs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/monitoring/${r.id}`} className="truncate text-[13.5px] font-medium text-ink hover:text-accent">
                    {r.name}
                  </Link>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {dateTime(r.created_at)} · {r.drifted_features}/{r.total_features} drifted ({pf(r.drift_share)})
                  </p>
                </div>
                <Badge tone={statusTone(r.overall_status)} dot>
                  {STATUS_META[r.overall_status]?.label || r.overall_status}
                </Badge>
                <div className="flex gap-1.5">
                  <Button size="sm" loading={busy === r.id + 'csv'} onClick={() => generate(r.id, 'csv')}>
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    CSV
                  </Button>
                  <Button size="sm" variant="primary" loading={busy === r.id + 'pdf'} onClick={() => generate(r.id, 'pdf')}>
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Export history" subtitle={`${total} report${total === 1 ? '' : 's'} generated.`} />
        {loading ? (
          <LoadingPanel label="Loading history…" rows={3} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : reports.length === 0 ? (
          <EmptyState title="No reports generated yet" description="Exports are recorded here with their format and timestamp." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-[11px] tracking-wider text-muted uppercase">
                    <th className="px-5 py-2.5 font-medium">Report</th>
                    <th className="px-3 py-2.5 font-medium">Format</th>
                    <th className="px-3 py-2.5 font-medium">File</th>
                    <th className="px-3 py-2.5 font-medium">Generated</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {reports.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2">
                      <td className="px-5 py-3">
                        <Link to={`/monitoring/${r.run_id}`} className="text-[13.5px] text-ink hover:text-accent">
                          {r.title}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={r.format === 'pdf' ? 'accent' : 'info'}>{r.format}</Badge>
                      </td>
                      <td className="tnum px-3 py-3 text-[12px] text-muted">{r.file_name || '—'}</td>
                      <td className="px-3 py-3 text-[12px] text-muted">{relativeTime(r.created_at)}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={busy === r.run_id + r.format}
                            onClick={() => generate(r.run_id, r.format)}
                          >
                            Re-download
                          </Button>
                          <button
                            onClick={() => setConfirm(r)}
                            aria-label="Delete record"
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
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        busy={busy === 'delete'}
        title="Delete report record"
        message="This removes the export record from history. Files already downloaded are unaffected."
      />
    </div>
  );
}

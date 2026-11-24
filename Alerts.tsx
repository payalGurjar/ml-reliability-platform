import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, CheckCheck, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Alert } from '../lib/types';
import { ALERT_TYPE_LABEL, dateTime, relativeTime } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingPanel,
  Modal,
  Pagination,
  Select,
  Textarea,
  statusTone,
  useToast,
} from '../components/ui';

const PAGE_SIZE = 15;

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('open');
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [detail, setDetail] = useState<Alert | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Alert | null>(null);
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ items: Alert[]; total: number }>('/api/alerts', {
        page,
        page_size: PAGE_SIZE,
        status: status || undefined,
        severity: severity || undefined,
        type: type || undefined,
        search: search.trim() || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
      });
      setAlerts(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts.');
    } finally {
      setLoading(false);
    }
  }, [page, status, severity, type, search, from, to]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const setAlertStatus = async (alert: Alert, next: 'open' | 'resolved', resolutionNote?: string) => {
    setBusy(true);
    try {
      await api.put('/api/alerts', { id: alert.id, status: next, resolution_note: resolutionNote });
      push('success', next === 'resolved' ? 'Alert resolved.' : 'Alert reopened.');
      setDetail(null);
      setNote('');
      await load();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Failed to update the alert.');
    } finally {
      setBusy(false);
    }
  };

  const resolveAllVisible = async () => {
    const ids = alerts.filter((a) => a.status === 'open').map((a) => a.id);
    if (!ids.length) return;
    setBusy(true);
    try {
      await api.put('/api/alerts', { ids, status: 'resolved' });
      push('success', `Resolved ${ids.length} alert${ids.length === 1 ? '' : 's'}.`);
      await load();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Bulk resolve failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api.del('/api/alerts', { id: confirm.id });
      push('success', 'Alert deleted.');
      setConfirm(null);
      await load();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Failed to delete the alert.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-ink">Alerts</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            Raised automatically for significant drift, performance degradation, concept drift, schema changes and data
            validation failures.
          </p>
        </div>
        <Button size="sm" onClick={resolveAllVisible} disabled={!alerts.some((a) => a.status === 'open')} loading={busy}>
          <CheckCheck className="h-3.5 w-3.5" />
          Resolve visible
        </Button>
      </header>

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[190px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9"
              placeholder="Search title or message…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select className="w-auto min-w-[120px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All states</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </Select>
          <Select className="w-auto min-w-[120px]" value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }}>
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </Select>
          <Select className="w-auto min-w-[150px]" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            {Object.entries(ALERT_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Input type="date" aria-label="From date" className="w-auto" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          <Input type="date" aria-label="To date" className="w-auto" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <LoadingPanel label="Loading alerts…" rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : alerts.length === 0 ? (
          <EmptyState
            icon={status === 'open' ? <ShieldCheck className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
            title={status === 'open' ? 'No open alerts' : 'No alerts match your filters'}
            description={
              status === 'open'
                ? 'Every monitored model is currently within its configured thresholds.'
                : 'Try widening the filters or date range.'
            }
          />
        ) : (
          <>
            <div className="divide-y divide-[var(--border)]">
              {alerts.map((a) => (
                <div key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(a.severity)} dot>
                        {a.severity}
                      </Badge>
                      <span className="text-[11px] tracking-wide text-muted uppercase">
                        {ALERT_TYPE_LABEL[a.type] || a.type}
                      </span>
                      {a.status === 'resolved' && <Badge tone="ok">resolved</Badge>}
                      <span className="text-[11.5px] text-muted">{relativeTime(a.created_at)}</span>
                    </div>
                    <button onClick={() => { setDetail(a); setNote(a.resolution_note || ''); }} className="mt-1.5 block text-left">
                      <p className="text-[13.5px] font-medium text-ink hover:text-accent">{a.title}</p>
                    </button>
                    <p className="tnum mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted">{a.message}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {a.run_id && (
                      <Link to={`/monitoring/${a.run_id}`}>
                        <Button size="sm" variant="ghost">
                          View run
                        </Button>
                      </Link>
                    )}
                    <Button
                      size="sm"
                      variant={a.status === 'open' ? 'secondary' : 'ghost'}
                      onClick={() => setAlertStatus(a, a.status === 'open' ? 'resolved' : 'open')}
                    >
                      {a.status === 'open' ? 'Resolve' : 'Reopen'}
                    </Button>
                    <button
                      onClick={() => setConfirm(a)}
                      aria-label="Delete alert"
                      className="rounded p-1.5 text-muted transition-colors hover:bg-crit-soft hover:text-crit"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.title || 'Alert'}
        description={detail ? (ALERT_TYPE_LABEL[detail.type] || detail.type) + ' · ' + dateTime(detail.created_at) : ''}
        footer={
          detail ? (
            <>
              <Button variant="ghost" onClick={() => setDetail(null)} disabled={busy}>
                Close
              </Button>
              <Button
                variant={detail.status === 'open' ? 'primary' : 'secondary'}
                loading={busy}
                onClick={() => setAlertStatus(detail, detail.status === 'open' ? 'resolved' : 'open', note)}
              >
                {detail.status === 'open' ? 'Resolve alert' : 'Reopen alert'}
              </Button>
            </>
          ) : null
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(detail.severity)} dot>
                {detail.severity}
              </Badge>
              <Badge tone={detail.status === 'open' ? 'warn' : 'ok'}>{detail.status}</Badge>
              {detail.resolved_at && <span className="text-[12px] text-muted">resolved {dateTime(detail.resolved_at)}</span>}
            </div>
            <p className="tnum text-[13px] leading-relaxed text-ink-dim">{detail.message}</p>
            {detail.metadata && Object.keys(detail.metadata).length > 0 && (
              <div>
                <p className="mb-1.5 text-[12px] font-medium tracking-wide text-muted uppercase">Evidence</p>
                <pre className="tnum max-h-56 overflow-auto rounded-md border border-line bg-surface-2 p-3 text-[11.5px] leading-relaxed text-ink-dim">
                  {JSON.stringify(detail.metadata, null, 2)}
                </pre>
              </div>
            )}
            <div>
              <p className="mb-1.5 text-[12px] font-medium tracking-wide text-muted uppercase">Resolution note</p>
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done about this?" />
            </div>
            {detail.run_id && (
              <Link to={`/monitoring/${detail.run_id}`} className="block text-[13px] text-accent hover:underline">
                Open the originating monitoring run →
              </Link>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        busy={busy}
        title="Delete alert"
        message={`"${confirm?.title}" will be permanently removed from the alert history.`}
      />
    </div>
  );
}

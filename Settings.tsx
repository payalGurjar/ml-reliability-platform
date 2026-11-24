import { useCallback, useEffect, useState } from 'react';
import { BrainCircuit, History, RotateCcw, Save, Sparkles, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { AppSettings, AuditLog } from '../lib/types';
import { dateTime } from '../lib/format';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
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
  Note,
  Toggle,
  useToast,
} from '../components/ui';

const DEFAULTS = {
  psi_low: 0.1,
  psi_high: 0.2,
  ks_alpha: 0.05,
  chi2_alpha: 0.05,
  js_threshold: 0.1,
  drift_share_threshold: 0.3,
  perf_degradation_threshold: 0.05,
  bins: 10,
};

const FIELDS: { key: keyof typeof DEFAULTS; label: string; hint: string; step: string }[] = [
  { key: 'psi_low', label: 'PSI — moderate threshold', hint: 'PSI at or above this value is flagged as moderate drift.', step: '0.01' },
  { key: 'psi_high', label: 'PSI — significant threshold', hint: 'PSI above this value is flagged as significant drift.', step: '0.01' },
  { key: 'ks_alpha', label: 'KS significance level (α)', hint: 'Two-sample Kolmogorov–Smirnov test for numerical features.', step: '0.01' },
  { key: 'chi2_alpha', label: 'Chi-square significance level (α)', hint: 'Pearson chi-square test for categorical features.', step: '0.01' },
  { key: 'js_threshold', label: 'Jensen–Shannon threshold', hint: 'JS divergence (base 2, bounded 0–1) that indicates drift.', step: '0.01' },
  { key: 'drift_share_threshold', label: 'Dataset drift share threshold', hint: 'Fraction of drifted features that triggers a dataset-level alert.', step: '0.05' },
  { key: 'perf_degradation_threshold', label: 'Performance degradation threshold', hint: 'Relative drop in the primary metric that counts as degradation.', step: '0.01' },
  { key: 'bins', label: 'Histogram bins', hint: 'Quantile bins used for PSI and Jensen–Shannon on numerical features.', step: '1' },
];

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [notifications, setNotifications] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const { push } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, l] = await Promise.all([
        api.get<AppSettings>('/api/settings'),
        api.get<AuditLog[]>('/api/settings', { resource: 'audit', limit: 40 }),
      ]);
      setSettings(s);
      setNotifications(s.notifications_enabled !== false);
      setForm(Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, String(s[k as keyof AppSettings] ?? '')])));
      setLogs(l);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setFormError(null);
    const low = Number(form.psi_low);
    const high = Number(form.psi_high);
    if (!Number.isFinite(low) || !Number.isFinite(high)) return setFormError('PSI thresholds must be numeric.');
    if (high <= low) return setFormError('The significant PSI threshold must be greater than the moderate threshold.');
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { notifications_enabled: notifications, theme };
      for (const k of Object.keys(DEFAULTS)) payload[k] = Number(form[k]);
      await api.put('/api/settings', payload);
      push('success', 'Thresholds saved. They apply to all future monitoring runs.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const restoreDefaults = () => {
    setForm(Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, String(v)])));
    setFormError(null);
  };

  const rebuildDemo = async () => {
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

  const removeDemo = async () => {
    setSeeding(true);
    try {
      await api.del('/api/settings?resource=demo', { resource: 'demo' });
      push('success', 'Demo data removed. Your own data is untouched.');
      setConfirmDemo(false);
      await load();
    } catch (err) {
      push('error', err instanceof Error ? err.message : 'Failed to remove the demo data.');
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <LoadingPanel label="Loading settings…" rows={6} />
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <ErrorState message={error} onRetry={load} />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[22px] font-bold text-ink">Settings</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Thresholds are stored per user and snapshotted into every monitoring run, so historic results stay
          reproducible.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader
            title="Drift detection thresholds"
            subtitle="Applied by the statistical engine on the next run."
            icon={<SlidersHorizontal className="h-4 w-4" />}
            action={
              <Button size="sm" variant="ghost" onClick={restoreDefaults}>
                <RotateCcw className="h-3.5 w-3.5" />
                Defaults
              </Button>
            }
          />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <Input
                  type="number"
                  step={f.step}
                  min="0"
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          <div className="border-t border-line px-5 py-4">
            <Note>
              Interpretation: PSI below {form.psi_low || '0.1'} is treated as low drift, between {form.psi_low || '0.1'}{' '}
              and {form.psi_high || '0.2'} as moderate, and above {form.psi_high || '0.2'} as significant. Hypothesis
              tests can raise a feature into the moderate band when the rejection is strong and the effect size is
              non-trivial, but statistical significance alone never produces a “significant” verdict.
            </Note>
            {formError && (
              <div className="mt-3">
                <InlineError message={formError} />
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="primary" onClick={save} loading={saving}>
                <Save className="h-3.5 w-3.5" />
                Save thresholds
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Workspace" subtitle="Account and interface preferences." />
            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-3.5 py-2.5">
                <div>
                  <p className="text-[13px] font-medium text-ink">Signed in as</p>
                  <p className="truncate text-[12.5px] text-muted">{user?.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-3.5 py-2.5">
                <div>
                  <p className="text-[13px] font-medium text-ink">Dark theme</p>
                  <p className="text-[12px] text-muted">Switch between the dark and light console.</p>
                </div>
                <Toggle checked={theme === 'dark'} onChange={toggle} label="Dark theme" />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-3.5 py-2.5">
                <div>
                  <p className="text-[13px] font-medium text-ink">In-app alert notifications</p>
                  <p className="text-[12px] text-muted">Create alerts when a run breaches thresholds.</p>
                </div>
                <Toggle checked={notifications} onChange={setNotifications} label="Notifications" />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="AI analysis provider" icon={<BrainCircuit className="h-4 w-4" />} />
            <div className="space-y-3 p-5">
              <div className="flex items-center gap-2">
                <Badge tone={settings?.llm_configured ? 'ok' : 'info'}>
                  {settings?.llm_configured ? 'external LLM configured' : 'built-in reasoner'}
                </Badge>
                {settings?.llm_model && <span className="tnum text-[12px] text-muted">{settings.llm_model}</span>}
              </div>
              <p className="text-[12.5px] leading-relaxed text-muted">
                Set the environment variables <code className="tnum text-ink-dim">LLM_API_URL</code>,{' '}
                <code className="tnum text-ink-dim">LLM_API_KEY</code> and{' '}
                <code className="tnum text-ink-dim">LLM_MODEL</code> to route analysis through any OpenAI-compatible
                endpoint. Keys are read server-side only and never exposed to the browser.
              </p>
              <p className="text-[12.5px] leading-relaxed text-muted">
                When no provider is configured — or the call fails — the platform falls back to a deterministic,
                grounded reasoner that derives every statement from the stored statistics. The feature therefore always
                works.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Demonstration data" icon={<Sparkles className="h-4 w-4" />} />
            <div className="space-y-3 p-5">
              <p className="text-[12.5px] leading-relaxed text-muted">
                The demo workspace contains deterministic synthetic credit-risk data with three production windows
                (stable, moderate drift, significant drift). Everything it creates is tagged{' '}
                <code className="tnum text-ink-dim">is_demo</code> and can be removed without touching your own data.
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={rebuildDemo} loading={seeding}>
                  Create demo workspace
                </Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmDemo(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove demo data
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Audit log" subtitle="Every mutation performed in your workspace." icon={<History className="h-4 w-4" />} />
        {logs.length === 0 ? (
          <EmptyState title="No activity recorded" description="Actions such as creating projects or executing runs appear here." />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-surface-2">
                <tr className="border-b border-line text-[11px] tracking-wider text-muted uppercase">
                  <th className="px-5 py-2.5 font-medium">Action</th>
                  <th className="px-3 py-2.5 font-medium">Entity</th>
                  <th className="px-3 py-2.5 font-medium">Detail</th>
                  <th className="px-5 py-2.5 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-5 py-2">
                      <Badge tone={l.action === 'delete' ? 'bad' : l.action === 'create' ? 'ok' : 'muted'}>{l.action}</Badge>
                    </td>
                    <td className="px-3 py-2 text-[12.5px] text-ink-dim">
                      {l.entity}
                      {l.entity_id ? ' #' + l.entity_id : ''}
                    </td>
                    <td className="tnum max-w-sm truncate px-3 py-2 text-[12px] text-muted">
                      {l.detail && Object.keys(l.detail).length ? JSON.stringify(l.detail) : '—'}
                    </td>
                    <td className="px-5 py-2 text-[12px] text-muted">{dateTime(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmDemo}
        onClose={() => setConfirmDemo(false)}
        onConfirm={removeDemo}
        busy={seeding}
        title="Remove demonstration data"
        message="All projects, models, datasets, runs and alerts tagged as demo data will be deleted. Data you created yourself is not affected."
        confirmLabel="Remove demo data"
      />
    </div>
  );
}

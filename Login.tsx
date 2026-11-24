import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Activity, BarChart3, Radar, ShieldCheck } from 'lucide-react';
import supabase from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import { useAuth } from '../contexts/AuthContext';
import { Button, Field, Input, InlineError, Note } from '../components/ui';

const HIGHLIGHTS = [
  { icon: Activity, title: 'Real statistical engine', body: 'PSI, Kolmogorov–Smirnov, Jensen–Shannon and chi-square computed on your data — never simulated.' },
  { icon: BarChart3, title: 'Performance & concept drift', body: 'Accuracy, F1, ROC-AUC, MAE/RMSE/R² compared against the reference window with degradation alerts.' },
  { icon: ShieldCheck, title: 'Grounded AI root-cause', body: 'Every explanation is derived from stored statistics and labelled as hypothesis when unproven.' },
];

export default function Login() {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  if (!loading && user) return <Navigate to="/" replace />;

  const validate = () => {
    const errs: { email?: string; password?: string } = {};
    if (!email.trim()) errs.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Password is required.';
    else if (password.length < 6) errs.password = 'Password must be at least 6 characters.';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
        if (!data.session) setInfo('Account created. Check your inbox to confirm the address, then sign in.');
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface px-12 py-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(900px 420px at 15% -5%, var(--accent-soft), transparent 60%), radial-gradient(700px 400px at 95% 105%, var(--info-soft), transparent 65%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent-soft">
              <Radar className="h-4.5 w-4.5 text-accent" />
            </div>
            <div className="leading-tight">
              <p className="font-display text-[17px] font-bold text-ink">DriftWatch</p>
              <p className="text-[10.5px] tracking-[0.18em] text-muted uppercase">ML Reliability Platform</p>
            </div>
          </div>

          <h1 className="mt-14 max-w-lg text-[38px] leading-[1.12] font-bold text-ink">
            Know the moment your model stops matching reality.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-dim">
            Upload a reference and a production window, and DriftWatch computes feature-level drift, prediction drift,
            concept drift and performance degradation — with the statistics to back every conclusion.
          </p>

          <div className="mt-12 space-y-5">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="flex gap-3.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-accent">
                  <h.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-ink">{h.title}</p>
                  <p className="mt-0.5 max-w-sm text-[13px] leading-relaxed text-muted">{h.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-[12px] text-muted">
          Statistical methods: Population Stability Index · two-sample Kolmogorov–Smirnov · Pearson chi-square ·
          Jensen–Shannon divergence.
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent-soft">
              <Radar className="h-4.5 w-4.5 text-accent" />
            </div>
            <p className="font-display text-[17px] font-bold text-ink">DriftWatch</p>
          </div>

          <h2 className="text-[22px] font-bold text-ink">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h2>
          <p className="mt-1 text-[13.5px] text-muted">
            {mode === 'signin' ? 'Access your monitoring workspace.' : 'Start monitoring models in under a minute.'}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
            <Field label="Email" required error={fieldErrors.email}>
              <Input
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password" required error={fieldErrors.password} hint={mode === 'signup' ? 'Minimum 6 characters.' : undefined}>
              <Input
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {error && <InlineError message={error} />}
            {info && <Note tone="ok">{info}</Note>}

            <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full justify-center">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[11.5px] tracking-wider text-muted uppercase">or</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <Button size="lg" className="w-full justify-center" onClick={() => signInWithGoogle('DriftWatch')}>
            <svg viewBox="0 0 24 24" className="h-4 w-4">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
              />
              <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
              <path
                fill="#EA4335"
                d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5a11 11 0 0 0-9.82 6.55l3.66 2.84C6.71 7.29 9.14 4.75 12 4.75z"
              />
            </svg>
            Continue with Google
          </Button>

          <p className="mt-6 text-center text-[13px] text-muted">
            {mode === 'signin' ? "Don't have an account?" : 'Already registered?'}{' '}
            <button
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError(null);
                setInfo(null);
                setFieldErrors({});
              }}
              className="font-medium text-accent hover:underline"
            >
              {mode === 'signin' ? 'Create one' : 'Sign in'}
            </button>
          </p>

          <div className="mt-6 rounded-lg border border-line bg-surface-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
            <span className="font-medium text-ink-dim">Demo account</span> — email{' '}
            <code className="tnum text-ink">demo@driftwatch.io</code> · password{' '}
            <code className="tnum text-ink">driftwatch123</code>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  BellRing,
  Boxes,
  Database,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Radar,
  Settings as SettingsIcon,
  Sun,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../lib/api';
import { cx } from './ui';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: Boxes },
  { to: '/models', label: 'Models', icon: Radar },
  { to: '/datasets', label: 'Datasets', icon: Database },
  { to: '/monitoring', label: 'Monitoring', icon: Activity },
  { to: '/alerts', label: 'Alerts', icon: BellRing },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [openAlerts, setOpenAlerts] = useState(0);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await api.get<{ total: number }>('/api/alerts', { status: 'open', page_size: 1 });
        if (active) setOpenAlerts(res.total);
      } catch {
        /* badge is non-critical */
      }
    };
    load();
    const t = setInterval(load, 45000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [location.pathname]);

  const initials = (user?.email || '?').slice(0, 2).toUpperCase();

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3">
      <Link to="/" className="mb-4 flex items-center gap-2.5 px-2 py-1.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/30 bg-accent-soft">
          <Radar className="h-4 w-4 text-accent" />
        </div>
        <div className="leading-tight">
          <p className="font-display text-[15px] font-bold text-ink">DriftWatch</p>
          <p className="text-[10.5px] tracking-wider text-muted uppercase">ML Reliability</p>
        </div>
      </Link>

      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cx(
              'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] transition-colors',
              isActive ? 'bg-surface-2 font-medium text-ink' : 'text-muted hover:bg-surface-2/60 hover:text-ink-dim',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute top-1.5 bottom-1.5 -left-3 w-0.5 rounded-r bg-accent" />}
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.label === 'Alerts' && openAlerts > 0 && (
                <span className="tnum rounded bg-crit-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-crit">
                  {openAlerts > 99 ? '99+' : openAlerts}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}

      <div className="mt-auto space-y-1 border-t border-line pt-3">
        <button
          onClick={toggle}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] text-muted transition-colors hover:bg-surface-2/60 hover:text-ink-dim"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
        <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-[11px] font-semibold text-ink-dim">
            {initials}
          </div>
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted" title={user?.email || ''}>
            {user?.email}
          </p>
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-crit"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-surface/80 backdrop-blur lg:block">
        {sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="slide-in absolute top-0 left-0 h-full w-64 border-r border-line bg-surface">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-[var(--bg)]/85 px-4 backdrop-blur lg:px-6">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle navigation"
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
          >
            {open ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
          </button>
          <Breadcrumb />
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/alerts"
              className="relative rounded-md border border-line bg-surface-2 p-1.5 text-muted transition-colors hover:text-ink"
              aria-label="Open alerts"
            >
              <BellRing className="h-4 w-4" />
              {openAlerts > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-crit px-1 text-[9.5px] font-bold text-white">
                  {openAlerts > 9 ? '9+' : openAlerts}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Breadcrumb() {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  const label = parts.length ? parts[0].replace(/-/g, ' ') : 'dashboard';
  return (
    <div className="flex min-w-0 items-center gap-2 text-[13px]">
      <span className="hidden text-muted sm:inline">DriftWatch</span>
      <span className="hidden text-muted/50 sm:inline">/</span>
      <span className="truncate font-medium text-ink capitalize">{label}</span>
      {parts.length > 1 && (
        <>
          <span className="text-muted/50">/</span>
          <span className="tnum truncate text-muted">{parts.slice(1).join(' / ')}</span>
        </>
      )}
    </div>
  );
}

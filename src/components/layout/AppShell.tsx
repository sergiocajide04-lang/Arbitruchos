import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  CalendarRange,
  CircleHelp,
  History,
  Home,
  ListChecks,
  LogOut,
  Plus,
  Settings,
  Trophy,
  User,
  Users,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { Suspense } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Logo, LogoMark } from '@/components/brand/Logo';
import { Avatar, LoadingBlock } from '@/components/ui/misc';
import { useAuth } from '@/features/auth/AuthProvider';
import { useGroup } from '@/features/group/GroupProvider';
import { InstallCard } from '@/features/pwa/InstallCard';
import { useOnline } from '@/features/pwa/useOnline';
import { toUserMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { signOut } from '@/services/api';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/entrenamientos', label: 'Entrenamientos', icon: ListChecks },
  { to: '/anadir', label: 'Añadir', icon: Plus },
  { to: '/clasificacion', label: 'Clasificación', icon: Trophy },
  { to: '/perfil', label: 'Perfil', icon: User },
];

export const SECONDARY_NAV: NavItem[] = [
  { to: '/temporada', label: 'Temporada', icon: CalendarRange },
  { to: '/historial', label: 'Historial', icon: History },
  { to: '/miembros', label: 'Miembros del grupo', icon: Users },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
  { to: '/ayuda', label: 'Ayuda e instalación', icon: CircleHelp },
];

function useSignOut() {
  const navigate = useNavigate();
  return async () => {
    try {
      await signOut();
      navigate('/acceso', { replace: true });
    } catch (e) {
      toast.error(toUserMessage(e));
    }
  };
}

function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-warning px-3 py-1.5 text-xs font-semibold text-[#1a1200]">
      <WifiOff className="size-3.5" aria-hidden />
      Sin conexión: puedes consultar lo ya cargado, pero no guardar cambios.
    </div>
  );
}

function UserMenu() {
  const { profile } = useAuth();
  const doSignOut = useSignOut();
  const navigate = useNavigate();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="rounded-full ring-offset-2 ring-offset-bg focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Menú de usuario y más opciones"
      >
        <Avatar name={profile?.display_name ?? '?'} color={profile?.avatar_color} size="sm" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[230px] rounded-2xl border border-border bg-surface p-1.5 shadow-2xl animate-fade-in"
        >
          <DropdownMenu.Label className="px-3 py-2 text-xs text-muted">
            {profile?.display_name ?? 'Mi cuenta'}
          </DropdownMenu.Label>
          {SECONDARY_NAV.map((item) => (
            <DropdownMenu.Item
              key={item.to}
              onSelect={() => navigate(item.to)}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-surface-2"
            >
              <item.icon className="size-4 text-muted" aria-hidden />
              {item.label}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => void doSignOut()}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-danger outline-none data-[highlighted]:bg-danger/10"
          >
            <LogOut className="size-4" aria-hidden />
            Cerrar sesión
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function BottomNav() {
  return (
    <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-surface/90 backdrop-blur-xl pb-safe lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5 px-1">
        {PRIMARY_NAV.map((item) => {
          const isAdd = item.to === '/anadir';
          return (
            <li key={item.to} className="flex justify-center">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'group flex min-h-[60px] w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors',
                    isAdd ? 'text-fg' : isActive ? 'text-accent-text' : 'text-muted hover:text-fg',
                  )
                }
              >
                {({ isActive }) =>
                  isAdd ? (
                    <>
                      <span className="-mt-5 grid size-14 place-items-center rounded-2xl bg-accent text-accent-fg shadow-glow ring-4 ring-bg transition-transform group-active:scale-95">
                        <Plus className="size-7" strokeWidth={2.6} aria-hidden />
                      </span>
                      <span className={cn(isActive && 'text-accent-text')}>{item.label}</span>
                    </>
                  ) : (
                    <>
                      <item.icon className="size-[22px]" strokeWidth={isActive ? 2.4 : 1.9} aria-hidden />
                      <span>{item.label === 'Entrenamientos' ? 'Entrenos' : item.label}</span>
                    </>
                  )
                }
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SideNav() {
  const doSignOut = useSignOut();
  const { group } = useGroup();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
      isActive ? 'bg-accent/10 text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-fg',
    );
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border/70 bg-surface/60 px-4 py-6 lg:flex">
      <div className="px-2">
        <Logo size="md" />
        {group && <p className="mt-2 truncate text-xs text-muted">{group.name}</p>}
      </div>
      <nav aria-label="Navegación principal" className="mt-8 flex-1 space-y-6 overflow-y-auto">
        <ul className="space-y-1">
          {PRIMARY_NAV.filter((i) => i.to !== '/anadir').map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className={linkClass}>
                <item.icon className="size-[18px]" aria-hidden />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <NavLink
          to="/anadir"
          className="flex items-center justify-center gap-2 rounded-xl bg-accent px-3 py-3 text-sm font-semibold text-accent-fg shadow-glow transition hover:brightness-105"
        >
          <Plus className="size-[18px]" strokeWidth={2.6} aria-hidden />
          Añadir registro
        </NavLink>
        <div>
          <p className="eyebrow mb-2 px-3">Más</p>
          <ul className="space-y-1">
            {SECONDARY_NAV.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={linkClass}>
                  <item.icon className="size-[18px]" aria-hidden />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      <button
        type="button"
        onClick={() => void doSignOut()}
        className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-danger/10 hover:text-danger"
      >
        <LogOut className="size-[18px]" aria-hidden />
        Cerrar sesión
      </button>
    </aside>
  );
}

function MobileHeader() {
  const { group, season } = useGroup();
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/85 backdrop-blur-xl pt-safe lg:hidden">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
        <NavLink to="/" className="flex min-w-0 items-center gap-2" aria-label="Inicio">
          <LogoMark className="size-8 shrink-0" />
          <span className="min-w-0">
            <span className="block font-display text-lg font-bold italic leading-none tracking-tight">
              REF<span className="text-accent-text">RUN</span>
            </span>
            {(season || group) && <span className="block truncate text-[11px] leading-tight text-muted">{season?.name ?? group?.name}</span>}
          </span>
        </NavLink>
        <UserMenu />
      </div>
    </header>
  );
}

export function AppShell() {
  const location = useLocation();
  return (
    <div className="flex min-h-dvh">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
      >
        Saltar al contenido
      </a>
      <SideNav />
      <div className="min-w-0 flex-1">
        <OfflineBanner />
        <MobileHeader />
        <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 focus:outline-none sm:px-6 lg:max-w-5xl lg:pb-12 lg:pt-8">
          <Suspense fallback={<LoadingBlock />}>
            <div key={location.pathname} className="animate-fade-in">
              <Outlet />
            </div>
          </Suspense>
        </main>
      </div>
      <BottomNav />
      <InstallCard />
    </div>
  );
}

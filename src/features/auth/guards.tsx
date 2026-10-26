import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { SplashScreen } from '@/components/brand/Logo';
import { ErrorBlock } from '@/components/ui/misc';
import { GroupProvider, useGroup } from '@/features/group/GroupProvider';
import { toUserMessage } from '@/lib/errors';
import { PREF_KEYS, readPref } from '@/lib/storage';
import { useAuth } from './AuthProvider';

/** Rutas privadas: exigen sesión. La seguridad real la imponen RLS y la API. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <SplashScreen />;
  if (status === 'signed_out') {
    const back = location.pathname === '/' ? '' : `?volver=${encodeURIComponent(location.pathname + location.search)}`;
    return <Navigate to={`/acceso${back}`} replace />;
  }
  return (
    <GroupProvider>
      <Outlet />
    </GroupProvider>
  );
}

/** Exige pertenecer a un grupo; si no, lleva a la pantalla de bienvenida. */
export function RequireGroup() {
  const { memberships, membershipsLoading, membershipsError, refetchMemberships } = useGroup();
  if (membershipsLoading) return <SplashScreen />;
  if (membershipsError) {
    return (
      <div className="mx-auto max-w-md p-6 pt-24">
        <ErrorBlock message={toUserMessage(membershipsError)} onRetry={refetchMemberships} />
      </div>
    );
  }
  if (memberships.length === 0 || readPref(PREF_KEYS.pendingInvite)) return <Navigate to="/bienvenida" replace />;
  return <Outlet />;
}

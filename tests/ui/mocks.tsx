/**
 * Dobles de prueba para los contextos de autenticación y grupo. Los tests los
 * activan con vi.mock(ruta, () => import('./mocks')) y modifican `state`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Group, MemberWithProfile, Season } from '@/domain/types';

export const ME = '11111111-1111-4111-8111-111111111111';
export const ANA = '22222222-2222-4222-8222-222222222222';
export const LUIS = '33333333-3333-4333-8333-333333333333';

const profile = (id: string, name: string, color: 'lime' | 'cyan' | 'amber' = 'lime') => ({
  id,
  display_name: name,
  avatar_color: color,
  created_at: '2026-09-01T10:00:00Z',
});

export const group: Group = { id: 'g1', name: 'Árbitros Norte', timezone: 'Europe/Madrid', match_reminder_days: [7, 1], match_reminder_hour: 20, created_by: ME, created_at: '2026-09-01T10:00:00Z' };

export const season: Season = {
  id: 's1',
  group_id: 'g1',
  name: 'Temporada 26/27',
  start_date: '2026-09-01',
  end_date: '2027-06-30',
  timezone: 'Europe/Madrid',
  status: 'active',
  compliance_policy: 'carry_forward',
  counted_activity_types: ['run', 'treadmill'],
  manual_requires_review: false,
  created_by: ME,
  created_at: '2026-09-01T10:00:00Z',
};

export const members: MemberWithProfile[] = [
  { group_id: 'g1', user_id: ME, role: 'member', status: 'active', joined_at: '2026-09-01T10:00:00Z', profile: profile(ME, 'Marta López') },
  { group_id: 'g1', user_id: ANA, role: 'owner', status: 'active', joined_at: '2026-09-01T10:00:00Z', profile: profile(ANA, 'Ana Ruiz', 'cyan') },
  { group_id: 'g1', user_id: LUIS, role: 'member', status: 'active', joined_at: '2026-09-02T10:00:00Z', profile: profile(LUIS, 'Luis Gil', 'amber') },
];

export const state = {
  status: 'signed_in' as 'loading' | 'signed_out' | 'signed_in',
  isAdmin: false,
  season: season as Season | null,
};

// --- AuthProvider ----------------------------------------------------------
export function useAuth() {
  const signedIn = state.status === 'signed_in';
  return {
    status: state.status,
    session: null,
    user: signedIn ? { id: ME, email: 'marta@example.test' } : null,
    profile: signedIn ? members[0]!.profile : null,
    profileLoading: false,
    recovering: false,
  };
}
export function useUser() {
  return { id: ME, email: 'marta@example.test' };
}
export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// --- GroupProvider -----------------------------------------------------------
export function useGroup() {
  return {
    memberships: [{ group, role: state.isAdmin ? 'admin' : 'member' }],
    membershipsLoading: false,
    membershipsError: null,
    group,
    role: state.isAdmin ? 'admin' : 'member',
    isAdmin: state.isAdmin,
    isOwner: false,
    setActiveGroup: () => undefined,
    members,
    activeMembers: members,
    profileOf: (id: string) => members.find((m) => m.user_id === id)?.profile,
    seasons: state.season ? [state.season] : [],
    seasonsLoading: false,
    season: state.season,
    setSeasonId: () => undefined,
    refetchMemberships: () => undefined,
  };
}
export const useActiveGroup = useGroup;
export function GroupProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// --- Render ------------------------------------------------------------------
export function renderRoute(element: ReactNode, { path = '/', at = path }: { path?: string; at?: string } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={<p>Otra ruta</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

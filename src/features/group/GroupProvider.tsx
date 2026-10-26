import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Group, MemberRole, MemberWithProfile, Profile, Season } from '@/domain/types';
import { PREF_KEYS, readPref, writePref } from '@/lib/storage';
import { getSupabase } from '@/lib/supabase';
import { listMembers, listMyMemberships, listSeasons, type Membership } from '@/services/api';
import { useUser } from '@/features/auth/AuthProvider';

interface GroupContextValue {
  memberships: Membership[];
  membershipsLoading: boolean;
  membershipsError: unknown;
  group: Group | null;
  role: MemberRole | null;
  isAdmin: boolean;
  isOwner: boolean;
  setActiveGroup(id: string): void;
  members: MemberWithProfile[];
  activeMembers: MemberWithProfile[];
  profileOf(userId: string): Profile | undefined;
  seasons: Season[];
  seasonsLoading: boolean;
  /** Temporada seleccionada (por defecto la activa o la más reciente). */
  season: Season | null;
  setSeasonId(id: string): void;
  refetchMemberships(): void;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => readPref(PREF_KEYS.activeGroup));
  const [seasonId, setSeasonId] = useState<string | null>(null);

  const membershipsQuery = useQuery({
    queryKey: ['memberships', user.id],
    queryFn: () => listMyMemberships(user.id),
  });
  const memberships = useMemo(() => membershipsQuery.data ?? [], [membershipsQuery.data]);
  const current = memberships.find((m) => m.group.id === activeGroupId) ?? memberships[0] ?? null;
  const group = current?.group ?? null;
  const groupId = group?.id;

  const membersQuery = useQuery({
    queryKey: ['members', groupId],
    queryFn: () => listMembers(groupId!),
    enabled: !!groupId,
  });
  const seasonsQuery = useQuery({
    queryKey: ['seasons', groupId],
    queryFn: () => listSeasons(groupId!),
    enabled: !!groupId,
  });

  const seasons = useMemo(() => seasonsQuery.data ?? [], [seasonsQuery.data]);
  const season =
    seasons.find((s) => s.id === seasonId) ?? seasons.find((s) => s.status === 'active') ?? seasons[0] ?? null;

  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const activeMembers = useMemo(() => members.filter((m) => m.status === 'active'), [members]);
  const profiles = useMemo(() => new Map(members.map((m) => [m.user_id, m.profile])), [members]);
  const profileOf = useCallback((id: string) => profiles.get(id), [profiles]);

  // Tiempo real: cualquier cambio en partidos/entrenamientos del grupo refresca los datos.
  useEffect(() => {
    if (!groupId) return;
    const supabase = getSupabase();
    const invalidate = (keys: string[][]) => keys.forEach((k) => void queryClient.invalidateQueries({ queryKey: k }));
    const channel = supabase
      .channel(`group-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workouts', filter: `group_id=eq.${groupId}` }, () =>
        invalidate([['workouts', groupId], ['workout'], ['audit', groupId]]),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `group_id=eq.${groupId}` }, () =>
        invalidate([['matches'], ['audit', groupId]]),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` }, () =>
        invalidate([['members', groupId]]),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [groupId, queryClient]);

  const setActiveGroup = useCallback((id: string) => {
    setActiveGroupId(id);
    setSeasonId(null);
    writePref(PREF_KEYS.activeGroup, id);
  }, []);

  const value = useMemo<GroupContextValue>(
    () => ({
      memberships,
      membershipsLoading: membershipsQuery.isLoading,
      membershipsError: membershipsQuery.error,
      group,
      role: current?.role ?? null,
      isAdmin: current?.role === 'owner' || current?.role === 'admin',
      isOwner: current?.role === 'owner',
      setActiveGroup,
      members,
      activeMembers,
      profileOf,
      seasons,
      seasonsLoading: seasonsQuery.isLoading,
      season,
      setSeasonId,
      refetchMemberships: () => void membershipsQuery.refetch(),
    }),
    [memberships, membershipsQuery, group, current?.role, setActiveGroup, members, activeMembers, profileOf, seasons, seasonsQuery.isLoading, season],
  );

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroup(): GroupContextValue {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroup debe usarse dentro de GroupProvider');
  return ctx;
}

/** Grupo activo garantizado (pantallas que requieren grupo). */
export function useActiveGroup(): GroupContextValue & { group: Group } {
  const ctx = useGroup();
  if (!ctx.group) throw new Error('Se requiere un grupo activo');
  return ctx as GroupContextValue & { group: Group };
}

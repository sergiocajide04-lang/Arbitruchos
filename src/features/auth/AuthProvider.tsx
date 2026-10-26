import type { Session, User } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Profile } from '@/domain/types';
import { getSupabase } from '@/lib/supabase';
import { getProfile } from '@/services/api';

interface AuthContextValue {
  status: 'loading' | 'signed_out' | 'signed_in';
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileLoading: boolean;
  /** true cuando el usuario llega desde el enlace de recuperación de contraseña. */
  recovering: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthContextValue['status']>('loading');
  const [recovering, setRecovering] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = getSupabase();
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setStatus(data.session ? 'signed_in' : 'signed_out');
      })
      .catch(() => mounted && setStatus('signed_out'));

    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') {
        setRecovering(false);
        // Nada de datos privados en memoria tras cerrar sesión.
        queryClient.clear();
      }
      setSession(next);
      setStatus(next ? 'signed_in' : 'signed_out');
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const userId = session?.user.id;
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => getProfile(userId!),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      profile: profileQuery.data ?? null,
      profileLoading: profileQuery.isLoading,
      recovering,
    }),
    [status, session, profileQuery.data, profileQuery.isLoading, recovering],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

/** Usuario autenticado garantizado (para pantallas privadas). */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('Se requiere una sesión iniciada');
  return user;
}

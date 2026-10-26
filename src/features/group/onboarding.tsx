import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, UsersRound } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { SplashScreen } from '@/components/brand/Logo';
import { AuthLayout, FormAlert } from '@/features/auth/AuthLayout';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatInviteCode } from '@/features/auth/schemas';
import { toUserMessage } from '@/lib/errors';
import { PREF_KEYS, readPref, removePref, writePref } from '@/lib/storage';
import { acceptInvitation, createGroup, signOut } from '@/services/api';
import { useGroup } from './GroupProvider';

export const TIMEZONES = [
  'Europe/Madrid',
  'Atlantic/Canary',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Paris',
  'Europe/Rome',
  'America/Argentina/Buenos_Aires',
  'America/Santiago',
  'America/Mexico_City',
  'America/New_York',
  'UTC',
];

function useJoin() {
  const queryClient = useQueryClient();
  const { setActiveGroup } = useGroup();
  return useMutation({
    mutationFn: (code: string) => acceptInvitation(code),
    // El código pendiente se descarta siempre tras intentarlo (evita reintentos en bucle).
    onSettled: () => removePref(PREF_KEYS.pendingInvite),
    onSuccess: async (groupId) => {
      setActiveGroup(groupId);
      await queryClient.invalidateQueries({ queryKey: ['memberships'] });
      toast.success('¡Ya formas parte del grupo!');
    },
  });
}

/** Pantalla para usuarios autenticados que aún no pertenecen a ningún grupo. */
export function OnboardingPage() {
  const { profile } = useAuth();
  const { memberships, membershipsLoading, setActiveGroup } = useGroup();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const join = useJoin();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [tz, setTz] = useState('Europe/Madrid');
  const [createError, setCreateError] = useState<string | null>(null);
  const triedPending = useRef(false);
  const [pending] = useState(() => readPref(PREF_KEYS.pendingInvite));
  const { mutate: joinMutate } = join;

  // Canjea automáticamente el código guardado durante el registro o desde un enlace.
  useEffect(() => {
    if (pending && !triedPending.current && !membershipsLoading) {
      triedPending.current = true;
      joinMutate(pending, { onSuccess: () => navigate('/', { replace: true }) });
    }
  }, [pending, membershipsLoading, joinMutate, navigate]);

  const create = useMutation({
    mutationFn: () => createGroup(name.trim(), tz),
    onSuccess: async (groupId) => {
      setActiveGroup(groupId);
      await queryClient.invalidateQueries({ queryKey: ['memberships'] });
      toast.success('Grupo creado. Ahora crea la primera temporada.');
      navigate('/temporada', { replace: true });
    },
    onError: (e) => setCreateError(toUserMessage(e)),
  });

  if (membershipsLoading) return <SplashScreen />;
  if (pending && (join.isIdle || join.isPending)) return <SplashScreen label="Uniéndote al grupo…" />;
  if (memberships.length > 0 && !join.isError) return <Navigate to="/" replace />;

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    join.mutate(code, { onSuccess: () => navigate('/', { replace: true }) });
  };
  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (name.trim().length < 2) {
      setCreateError('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    create.mutate();
  };

  return (
    <div className="min-h-dvh bg-bg">
      <div className="track-texture pointer-events-none fixed inset-0 opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-xl px-5 pb-12 pt-[calc(2rem+env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <Logo />
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut aria-hidden /> Salir
          </Button>
        </div>
        <h1 className="mt-10 font-display text-4xl font-bold uppercase italic leading-none tracking-tight">
          Hola{profile ? `, ${profile.display_name}` : ''}
        </h1>
        <p className="mt-2 text-muted">Para ver el reto necesitas pertenecer a un grupo privado.</p>

        <section className="card mt-8 p-5" aria-labelledby="join-title">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent-text">
              <KeyRound className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="join-title" className="font-semibold">Tengo un código de invitación</h2>
              <p className="text-xs text-muted">Te lo facilita el administrador del grupo.</p>
            </div>
          </div>
          <form onSubmit={onJoin} className="space-y-3">
            {join.error && <FormAlert>{toUserMessage(join.error)}</FormAlert>}
            <Field label="Código">
              <Input
                value={code}
                onChange={(e) => setCode(formatInviteCode(e.target.value))}
                placeholder="ABCDE-12345"
                autoCapitalize="characters"
                autoComplete="off"
                className="font-mono uppercase tracking-widest"
              />
            </Field>
            <Button type="submit" block loading={join.isPending} disabled={code.replace('-', '').length !== 10}>
              Unirme al grupo
            </Button>
          </form>
        </section>

        <section className="card mt-4 p-5" aria-labelledby="create-title">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-fg">
              <UsersRound className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="create-title" className="font-semibold">Crear un grupo nuevo</h2>
              <p className="text-xs text-muted">Serás su propietario y podrás invitar al resto.</p>
            </div>
          </div>
          <form onSubmit={onCreate} className="space-y-3">
            {createError && <FormAlert>{createError}</FormAlert>}
            <Field label="Nombre del grupo">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Árbitros Liga Norte" />
            </Field>
            <Field label="Zona horaria" hint="Define qué día es «hoy» y cuándo empieza cada semana.">
              <Select value={tz} onChange={(e) => setTz(e.target.value)}>
                {TIMEZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="secondary" block loading={create.isPending}>
              Crear grupo
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}

/** Enlace de invitación: /unirse?codigo=ABCDE-12345 */
export function JoinPage() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  const initial = formatInviteCode(params.get('codigo') ?? '');
  const [code, setCode] = useState(initial);
  const navigate = useNavigate();

  if (status === 'loading') return <SplashScreen />;
  if (status === 'signed_in') {
    // El canje se hace en la pantalla de bienvenida (necesita el contexto de grupo).
    if (code.replace('-', '').length === 10) writePref(PREF_KEYS.pendingInvite, code);
    return <Navigate to="/bienvenida" replace />;
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    writePref(PREF_KEYS.pendingInvite, code);
    navigate(`/registro?codigo=${encodeURIComponent(code)}`);
  };

  return (
    <AuthLayout title="Únete al grupo" subtitle="Crea tu cuenta (o entra con la tuya) y el código se aplicará automáticamente.">
      <form onSubmit={save} className="space-y-4">
        <Field label="Código de invitación">
          <Input
            value={code}
            onChange={(e) => setCode(formatInviteCode(e.target.value))}
            placeholder="ABCDE-12345"
            className="font-mono uppercase tracking-widest"
            autoComplete="off"
          />
        </Field>
        <Button type="submit" block size="lg" disabled={code.replace('-', '').length !== 10}>
          Crear cuenta y unirme
        </Button>
        <Button
          type="button"
          variant="secondary"
          block
          disabled={code.replace('-', '').length !== 10}
          onClick={() => {
            writePref(PREF_KEYS.pendingInvite, code);
            navigate('/acceso?volver=/bienvenida');
          }}
        >
          Ya tengo cuenta
        </Button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link to="/acceso" className="font-semibold text-accent-text hover:underline">
          Volver
        </Link>
      </p>
    </AuthLayout>
  );
}

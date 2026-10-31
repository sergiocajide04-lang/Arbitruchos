import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Pencil, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { CharCounter, Field, Input } from '@/components/ui/field';
import { NAME_MAX, displayNameError, nameLength } from '@/domain/profile';
import { AVATAR_COLORS, Avatar, Badge, EmptyState, ErrorBlock, LoadingBlock, ProgressBar, Stat } from '@/components/ui/misc';
import { ROLE_LABELS, type AvatarColor, type Profile } from '@/domain/types';
import { useAuth, useUser } from '@/features/auth/AuthProvider';
import { useActiveGroup } from '@/features/group/GroupProvider';
import { NoSeasonState } from '@/features/seasons/NoSeasonState';
import { KmPerWeekChart, MonthlyChart, MonthlyPaceChart } from '@/features/stats/charts';
import { useMemberStats } from '@/features/stats/useMemberStats';
import { formatLongDate, formatShortDate } from '@/lib/dates';
import { toUserMessage } from '@/lib/errors';
import { formatKm, formatPace, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { updateMyProfile } from '@/services/api';

const COLOR_LABELS: Record<AvatarColor, string> = {
  lime: 'Lima',
  cyan: 'Cian',
  amber: 'Ámbar',
  violet: 'Violeta',
  rose: 'Rosa',
  sky: 'Cielo',
  orange: 'Naranja',
  teal: 'Turquesa',
};

export default function ProfilePage() {
  const { userId: param } = useParams();
  const user = useUser();
  const { profile: myProfile } = useAuth();
  const { members, season } = useActiveGroup();
  const userId = param ?? user.id;
  const own = userId === user.id;
  const member = members.find((m) => m.user_id === userId);
  const profile = own ? myProfile ?? member?.profile : member?.profile;
  const s = useMemberStats(userId);
  const [editing, setEditing] = useState(false);

  if (!profile) {
    return (
      <Card>
        <EmptyState icon={UserX} title="Miembro no encontrado" description="No pertenece a tu grupo o ya no está disponible." />
      </Card>
    );
  }

  return (
    <>
      <PageHeader title={own ? 'Mi perfil' : 'Perfil'} back={own ? undefined : true} />
      <Card className="relative overflow-hidden">
        <div aria-hidden className="track-texture pointer-events-none absolute inset-0" />
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <Avatar name={profile.display_name} color={profile.avatar_color} size="xl" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-4xl font-bold uppercase italic leading-none tracking-tight">{profile.display_name}</h2>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              {member && <Badge tone={member.role === 'member' ? 'neutral' : 'accent'}>{ROLE_LABELS[member.role]}</Badge>}
              {member?.status === 'inactive' && <Badge tone="warning">Inactivo</Badge>}
              <span>En el grupo desde el {formatLongDate((member?.joined_at ?? profile.created_at).slice(0, 10))}</span>
            </p>
          </div>
          <div className="flex gap-2">
            {own && (
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                <Pencil aria-hidden /> Editar
              </Button>
            )}
            <Button asChild variant="secondary" size="sm">
              <Link to={own ? '/estadisticas' : `/estadisticas?u=${userId}`}>
                <BarChart3 aria-hidden /> Estadísticas
              </Link>
            </Button>
          </div>
        </div>
      </Card>

      <div className="mt-5 space-y-5">
        {!season ? (
          <NoSeasonState />
        ) : !s || s.isLoading ? (
          <LoadingBlock />
        ) : s.error ? (
          <ErrorBlock message={toUserMessage(s.error)} onRetry={s.refetch} />
        ) : (
          <>
            <Card className="p-5">
              <div className="flex items-end justify-between">
                <div>
                  <p className="eyebrow">Acumulado · {season.name}</p>
                  <p className="num mt-1 text-5xl font-bold leading-none">{formatPct(s.summary.pct)}</p>
                </div>
                <p className="text-right text-xs text-muted">
                  {s.summary.weeksMet}/{s.summary.weeksWithTarget}
                  <br />
                  semanas cumplidas
                </p>
              </div>
              <ProgressBar value={s.summary.pct} className="mt-3" label="Cumplimiento de la temporada" />
              <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                <Stat label="Objetivo temporada" value={formatKm(s.summary.targetKm)} unit="km" />
                <Stat label="Completados" value={formatKm(s.summary.completedKm)} unit="km" emphasis />
                <Stat label="Pendientes" value={formatKm(s.summary.pendingKm)} unit="km" />
                <Stat label="Entrenamientos" value={s.seasonStats.count} />
                <Stat
                  label="Distancia media"
                  value={s.seasonStats.avgKm !== null ? formatKm(s.seasonStats.avgKm, true) : '—'}
                  unit={s.seasonStats.avgKm !== null ? 'km' : undefined}
                />
                <Stat label="Ritmo medio" value={formatPace(s.seasonStats.pace)} unit={s.seasonStats.pace ? '/km' : undefined} />
                <Stat
                  label="Mejor ritmo"
                  value={formatPace(s.best?.pace)}
                  unit={s.best ? '/km' : undefined}
                  hint={s.best ? formatShortDate(s.best.workout.activity_date) : undefined}
                />
                <Stat
                  label="Más larga"
                  value={s.longest ? formatKm(s.longest.distance_km, true) : '—'}
                  unit={s.longest ? 'km' : undefined}
                  hint={s.longest ? formatShortDate(s.longest.activity_date) : undefined}
                />
              </div>
            </Card>
            <div className="grid gap-5 lg:grid-cols-2">
              <MonthlyChart data={s.monthly} />
              <MonthlyPaceChart data={s.monthly} />
              <div className="lg:col-span-2">
                <KmPerWeekChart data={s.weekly} />
              </div>
            </div>
          </>
        )}
      </div>

      {own && editing && <EditProfileDialog profile={profile} onClose={() => setEditing(false)} />}
    </>
  );
}

function EditProfileDialog({ profile, onClose }: { profile: Profile; onClose(): void }) {
  const queryClient = useQueryClient();
  const { group } = useActiveGroup();
  const [name, setName] = useState(profile.display_name);
  const [color, setColor] = useState<AvatarColor>(profile.avatar_color);
  const save = useMutation({
    mutationFn: () => updateMyProfile(profile.id, { display_name: name.trim(), avatar_color: color }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['members', group.id] }),
      ]);
      toast.success('Perfil actualizado.');
      onClose();
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });
  const nameError = displayNameError(name);
  const invalid = nameError !== null;

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Editar perfil"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} disabled={invalid} onClick={() => save.mutate()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          label="Nombre deportivo"
          error={nameError ?? undefined}
          trailing={<CharCounter length={nameLength(name)} max={NAME_MAX} />}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Color del avatar</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color del avatar">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={COLOR_LABELS[c]}
                onClick={() => setColor(c)}
                className={cn('rounded-full p-0.5 ring-2 ring-transparent transition', color === c && 'ring-accent')}
              >
                <Avatar name={name || '?'} color={c} size="md" />
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

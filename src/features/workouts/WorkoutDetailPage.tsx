import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Info, Pencil, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/field';
import { Avatar, Badge, EmptyState, ErrorBlock, LoadingBlock, StatusBadge } from '@/components/ui/misc';
import { isCountable } from '@/domain/calc/compliance';
import { ACTIVITY_LABELS, SOURCE_LABELS, type Workout } from '@/domain/types';
import { useUser } from '@/features/auth/AuthProvider';
import { useActiveGroup } from '@/features/group/GroupProvider';
import { useOnline } from '@/features/pwa/useOnline';
import { formatLongDate, formatWeekRange, todayInTimeZone } from '@/lib/dates';
import { toUserMessage } from '@/lib/errors';
import { formatDuration, formatInt, formatKm, formatPace, formatRelative, formatSpeed } from '@/lib/format';
import { deleteWorkout, getWorkout, moderateWorkout, updateWorkout } from '@/services/api';
import { formFromWorkout, toWorkoutInput, workoutFormSchema, type WorkoutFormValues } from './form';
import { WorkoutFields } from './WorkoutFields';

export function WorkoutDetailPage() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: ['workout', id], queryFn: () => getWorkout(id) });

  if (query.isLoading) return <LoadingBlock />;
  if (query.error) return <ErrorBlock message={toUserMessage(query.error)} onRetry={() => void query.refetch()} />;
  if (!query.data) {
    return (
      <Card>
        <EmptyState
          icon={Info}
          title="Entrenamiento no encontrado"
          description="Puede que se haya eliminado o que no tengas acceso."
          action={
            <Button asChild variant="secondary">
              <Link to="/entrenamientos">Ver entrenamientos</Link>
            </Button>
          }
        />
      </Card>
    );
  }
  return <WorkoutDetail workout={query.data} />;
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/50 py-2.5 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

function WorkoutDetail({ workout: w }: { workout: Workout }) {
  const user = useUser();
  const { group, isAdmin, profileOf, seasons } = useActiveGroup();
  const online = useOnline();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moderating, setModerating] = useState<'confirmed' | 'rejected' | null>(null);
  const [note, setNote] = useState('');

  const own = w.user_id === user.id;
  const author = profileOf(w.user_id);
  const season = seasons.find((s) => w.activity_date >= s.start_date && w.activity_date <= s.end_date) ?? null;
  const counts = season ? isCountable(w, season) : false;
  const closed = season?.status === 'closed';
  const today = todayInTimeZone(season?.timezone ?? group.timezone);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workout', w.id] }),
      queryClient.invalidateQueries({ queryKey: ['workouts', group.id] }),
    ]);
  };

  const remove = useMutation({
    mutationFn: () => deleteWorkout(w.id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Entrenamiento eliminado. Los saldos se han recalculado.');
      navigate('/entrenamientos', { replace: true });
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });

  const moderate = useMutation({
    mutationFn: (status: 'confirmed' | 'rejected') => moderateWorkout(w.id, status, note.trim() || null),
    onSuccess: async () => {
      await invalidate();
      setModerating(null);
      setNote('');
      toast.success('Estado actualizado.');
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });

  let notCountingReason: string | null = null;
  if (!season) notCountingReason = 'La fecha no pertenece a ninguna temporada.';
  else if (w.validation_status === 'pending') notCountingReason = 'Está pendiente de revisión por un administrador.';
  else if (w.validation_status === 'rejected') notCountingReason = 'Ha sido rechazado por un administrador.';
  else if (!counts) notCountingReason = `«${ACTIVITY_LABELS[w.activity_type]}» no computa en la temporada ${season.name}.`;

  return (
    <>
      <PageHeader title="Entrenamiento" back="/entrenamientos" />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="relative overflow-hidden">
          <div aria-hidden className="track-texture pointer-events-none absolute inset-0" />
          <div className="relative p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Avatar name={author?.display_name ?? '?'} color={author?.avatar_color} />
              <div className="min-w-0">
                <p className="truncate font-semibold">{own ? 'Tú' : author?.display_name ?? 'Miembro'}</p>
                <p className="text-xs text-muted">
                  {formatLongDate(w.activity_date)}
                  {w.activity_time ? ` · ${w.activity_time}` : ''}
                </p>
              </div>
              <div className="ml-auto">
                <StatusBadge status={w.validation_status} />
              </div>
            </div>
            <p className="num mt-6 text-7xl font-bold leading-none">
              {formatKm(w.distance_km, true)}
              <span className="ml-1 text-2xl text-muted">km</span>
            </p>
            {w.distance_unit !== 'km' && (
              <p className="mt-1 text-sm text-muted">
                Original: {formatKm(w.distance_value, true)} {w.distance_unit}
              </p>
            )}
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div>
                <p className="eyebrow">Duración</p>
                <p className="num mt-1 text-2xl font-bold">{formatDuration(w.duration_s)}</p>
              </div>
              <div>
                <p className="eyebrow">Ritmo</p>
                <p className="num mt-1 text-2xl font-bold">
                  {formatPace(w.avg_pace_s_per_km)}
                  {w.avg_pace_s_per_km && <span className="ml-0.5 text-xs text-muted">/km</span>}
                </p>
              </div>
              <div>
                <p className="eyebrow">Velocidad</p>
                <p className="num mt-1 text-2xl font-bold">
                  {formatSpeed(w.avg_speed_kmh)}
                  {w.avg_speed_kmh && <span className="ml-0.5 text-xs text-muted">km/h</span>}
                </p>
              </div>
            </div>
            {notCountingReason ? (
              <p className="mt-6 flex gap-2 rounded-xl border border-border bg-surface-2/60 p-3 text-sm text-muted">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> No cuenta para el objetivo: {notCountingReason}
              </p>
            ) : (
              <p className="mt-6 flex gap-2 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />
                Cuenta para el objetivo de la semana {formatWeekRange(w.week_start)}.
              </p>
            )}
            {w.review_note && (
              <p className="mt-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                Nota del administrador: {w.review_note}
              </p>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Detalles" as="h2" />
            <dl className="px-4 pb-3 sm:px-5">
              <Item label="Actividad">{ACTIVITY_LABELS[w.activity_type]}</Item>
              <Item label="Fuente">{SOURCE_LABELS[w.source]}</Item>
              <Item label="Método">
                <Badge>{w.entry_method === 'ocr' ? 'Captura revisada' : 'Manual'}</Badge>
              </Item>
              <Item label="Semana">{formatWeekRange(w.week_start)}</Item>
              {w.calories !== null && (
                <Item label="Calorías">
                  {formatInt(w.calories)} kcal{' '}
                  <span className="text-muted">
                    ({w.calories_kind === 'active' ? 'activas' : w.calories_kind === 'total' ? 'totales' : 'tipo desconocido'})
                  </span>
                </Item>
              )}
              {typeof w.details.watts === 'number' && <Item label="Vatios medios">{w.details.watts} W</Item>}
              {w.details.pace_derived === true && <Item label="Ritmo">Calculado (distancia ÷ tiempo)</Item>}
              {w.details.ocr?.edited_fields && w.details.ocr.edited_fields.length > 0 && (
                <Item label="Corregido tras OCR">{w.details.ocr.edited_fields.length} campo(s)</Item>
              )}
              <Item label="Registrado">{formatRelative(w.created_at)}</Item>
              {w.updated_at !== w.created_at && <Item label="Última edición">{formatRelative(w.updated_at)}</Item>}
            </dl>
          </Card>

          {own && !closed && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)} disabled={!online}>
                <Pencil aria-hidden /> Editar
              </Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={!online}>
                <Trash2 aria-hidden /> Eliminar
              </Button>
            </div>
          )}
          {isAdmin && !own && !closed && (
            <Card className="p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="size-4 text-accent-text" aria-hidden /> Moderación
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" disabled={!online || w.validation_status === 'confirmed'} onClick={() => setModerating('confirmed')}>
                  <CheckCircle2 aria-hidden /> Validar
                </Button>
                <Button variant="danger" disabled={!online || w.validation_status === 'rejected'} onClick={() => setModerating('rejected')}>
                  <XCircle aria-hidden /> Rechazar
                </Button>
              </div>
            </Card>
          )}
          {closed && <p className="text-xs text-muted">La temporada está cerrada: el registro ya no se puede modificar.</p>}
        </div>
      </div>

      {editing && <EditWorkoutDialog workout={w} today={today} onClose={() => setEditing(false)} onSaved={invalidate} />}

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar este entrenamiento?"
        description={`Se descontarán ${formatKm(w.distance_km, true)} km de la semana ${formatWeekRange(w.week_start)}. Quedará constancia en el historial de cambios.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Eliminar
            </Button>
          </>
        }
      />

      <Dialog
        open={!!moderating}
        onOpenChange={(o) => !o && setModerating(null)}
        title={moderating === 'rejected' ? 'Rechazar entrenamiento' : 'Validar entrenamiento'}
        description={moderating === 'rejected' ? 'No contará para el objetivo. Explica el motivo al árbitro.' : 'Contará para el objetivo del árbitro.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModerating(null)}>
              Cancelar
            </Button>
            <Button
              variant={moderating === 'rejected' ? 'danger' : 'primary'}
              loading={moderate.isPending}
              disabled={moderating === 'rejected' && note.trim().length < 3}
              onClick={() => moderating && moderate.mutate(moderating)}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <Field label="Nota" optional={moderating !== 'rejected'}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
      </Dialog>
    </>
  );
}

function EditWorkoutDialog({
  workout,
  today,
  onClose,
  onSaved,
}: {
  workout: Workout;
  today: string;
  onClose(): void;
  onSaved(): Promise<void>;
}) {
  const form = useForm<WorkoutFormValues>({
    resolver: zodResolver(workoutFormSchema({ today, requireConfirmation: true })) as unknown as Resolver<WorkoutFormValues>,
    defaultValues: { ...formFromWorkout(workout), confirmed: false },
  });
  const save = useMutation({
    mutationFn: (v: WorkoutFormValues) => {
      const input = toWorkoutInput(v, { entryMethod: workout.entry_method, baseDetails: workout.details });
      return updateWorkout(workout.id, input);
    },
    onSuccess: async () => {
      await onSaved();
      toast.success('Cambios guardados. Los saldos se han recalculado.');
      onClose();
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Editar entrenamiento"
      description="Los cambios quedan registrados en el historial."
      className="sm:max-w-2xl"
    >
      <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate className="space-y-5">
        <WorkoutFields form={form} today={today} showConfirm />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            Guardar cambios
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

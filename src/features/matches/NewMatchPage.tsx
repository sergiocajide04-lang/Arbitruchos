import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Flag } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { LoadingBlock } from '@/components/ui/misc';
import { previewTarget, type CardColor } from '@/domain/calc/goals';
import { useUser } from '@/features/auth/AuthProvider';
import { useActiveGroup } from '@/features/group/GroupProvider';
import { useOnline } from '@/features/pwa/useOnline';
import { NoSeasonState } from '@/features/seasons/NoSeasonState';
import { useFormDraft } from '@/hooks/useFormDraft';
import { useSeasonData } from '@/hooks/useSeasonData';
import { addDays, formatLongDate, formatPeriodRange, isIsoDate, matchPeriodOf, matchWeekStart } from '@/lib/dates';
import { toUserMessage } from '@/lib/errors';
import { PREF_KEYS } from '@/lib/storage';
import { createMatch } from '@/services/api';
import { CardsFieldset, TargetBreakdownList } from './CardsFieldset';
import { matchFormSchema, toMatchInput, type MatchFormParsed, type MatchFormValues } from './form';

export function NewMatchPage() {
  const { season } = useActiveGroup();
  if (!season) {
    return (
      <>
        <PageHeader title="Registrar partido" back="/anadir" />
        <NoSeasonState />
      </>
    );
  }
  return <MatchForm />;
}

function MatchForm() {
  const user = useUser();
  const { group, season, isAdmin, activeMembers, profileOf } = useActiveGroup();
  const data = useSeasonData();
  const online = useOnline();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<MatchFormParsed | null>(null);

  const form = useForm<MatchFormValues, unknown, MatchFormParsed>({
    resolver: zodResolver(matchFormSchema),
    defaultValues: {
      matchDate: data.today,
      // Lunes del periodo del partido (la base de datos impide dos partidos del mismo árbitro en él).
      weekStart: matchWeekStart(data.today),
      refereeId: user.id,
      competition: '',
      homeTeam: '',
      awayTeam: '',
      homeGoals: '',
      awayGoals: '',
      yellowCards: '0',
      blueCards: '0',
      redCards: '0',
      notes: '',
    },
  });
  const clearDraft = useFormDraft(PREF_KEYS.draftMatch, form);
  const { errors } = form.formState;
  const [matchDate, refereeId, homeGoals, awayGoals, homeTeam, awayTeam, yellowCards, blueCards, redCards] = useWatch({
    control: form.control,
    name: ['matchDate', 'refereeId', 'homeGoals', 'awayGoals', 'homeTeam', 'awayTeam', 'yellowCards', 'blueCards', 'redCards'],
  });

  const cardValues = { yellow: yellowCards ?? '', blue: blueCards ?? '', red: redCards ?? '' };
  const cardField = { yellow: 'yellowCards', blue: 'blueCards', red: 'redCards' } as const;
  const setCard = (c: CardColor, v: string) => form.setValue(cardField[c], v, { shouldValidate: form.formState.isSubmitted, shouldDirty: true });
  const preview = previewTarget(homeGoals ?? '', awayGoals ?? '', cardValues);
  const referee = profileOf(refereeId ?? '');

  // El objetivo cuenta desde el sábado 09:00 del fin de semana del partido.
  const period = matchDate && isIsoDate(matchDate) ? matchPeriodOf(matchDate) : null;
  // Se deriva SIEMPRE de la fecha (nunca de un borrador guardado); el servidor la recalcula igualmente.
  const weekStart = matchDate && isIsoDate(matchDate) ? matchWeekStart(matchDate) : null;

  // Misma regla que el servidor: fecha entre (inicio − 7 días) y el fin de la temporada.
  const outOfSeason = !!weekStart && (matchDate! > season!.end_date || matchDate! < addDays(season!.start_date, -7));
  const duplicate = data.matches.find(
    (m) => m.referee_id === refereeId && !!period && matchPeriodOf(m.match_date) === period,
  );

  const save = useMutation({
    mutationFn: (v: MatchFormParsed) => createMatch(group.id, season!.id, toMatchInput({ ...v, weekStart: matchWeekStart(v.matchDate) })),
    onSuccess: async (match) => {
      clearDraft();
      await queryClient.invalidateQueries({ queryKey: ['matches', season!.id] });
      toast.success(`Partido guardado: ${match.target_km} km de objetivo desde el sábado ${formatPeriodRange(matchPeriodOf(match.match_date)).split(' – ')[0]} a las 9:00.`);
      navigate('/', { replace: true });
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });

  const onSubmit = form.handleSubmit((v) => setPending(v));

  if (data.isLoading) return <LoadingBlock />;

  const closed = season!.status === 'closed';

  return (
    <>
      <PageHeader title="Registrar partido" subtitle="Los goles y las tarjetas del partido se convierten en tu objetivo de kilómetros." back="/anadir" />
      {closed && (
        <p role="alert" className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          La temporada «{season!.name}» está cerrada y no admite nuevos partidos.
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="space-y-5 p-4 sm:p-6">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Resultado</legend>
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
              <Field label={<span className="text-xs text-muted">{homeTeam?.trim() || 'Equipo 1'}</span>} error={errors.homeGoals?.message}>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="–"
                  aria-label="Goles del primer equipo"
                  className="num h-20 text-center text-5xl font-bold"
                  {...form.register('homeGoals')}
                />
              </Field>
              <span className="num pt-12 text-3xl font-bold text-muted" aria-hidden>
                –
              </span>
              <Field label={<span className="text-xs text-muted">{awayTeam?.trim() || 'Equipo 2'}</span>} error={errors.awayGoals?.message}>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="–"
                  aria-label="Goles del segundo equipo"
                  className="num h-20 text-center text-5xl font-bold"
                  {...form.register('awayGoals')}
                />
              </Field>
            </div>
          </fieldset>

          <CardsFieldset
            values={cardValues}
            onChange={setCard}
            errors={{ yellow: errors.yellowCards?.message, blue: errors.blueCards?.message, red: errors.redCards?.message }}
          />

          <Field
            label="Fecha del partido"
            error={errors.matchDate?.message ?? errors.weekStart?.message}
            hint={period ? `El objetivo cuenta desde el sábado a las 9:00: ${formatPeriodRange(period)}.` : undefined}
          >
            <Input
              type="date"
              max={addDays(data.today, 1)}
              {...form.register('matchDate', {
                onChange: (e) => {
                  if (isIsoDate(e.target.value)) form.setValue('weekStart', matchWeekStart(e.target.value));
                },
              })}
            />
          </Field>

          <Field
            label="Árbitro al que se asigna el objetivo"
            error={errors.refereeId?.message}
            hint={isAdmin ? 'Como administrador puedes registrar el partido de otro miembro.' : 'Solo puedes registrar tus propios partidos.'}
          >
            <Select disabled={!isAdmin} {...form.register('refereeId')}>
              {(isAdmin ? activeMembers : activeMembers.filter((m) => m.user_id === user.id)).map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profile.display_name}
                  {m.user_id === user.id ? ' (tú)' : ''}
                </option>
              ))}
            </Select>
          </Field>

          <details className="group rounded-xl border border-border/70 bg-surface-2/40 p-4 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
              Equipos, competición y notas <span className="text-xs text-muted">(opcional)</span>
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Equipo local" optional error={errors.homeTeam?.message}>
                <Input maxLength={60} {...form.register('homeTeam')} />
              </Field>
              <Field label="Equipo visitante" optional error={errors.awayTeam?.message}>
                <Input maxLength={60} {...form.register('awayTeam')} />
              </Field>
              <Field label="Competición o categoría" optional className="sm:col-span-2" error={errors.competition?.message}>
                <Input maxLength={60} placeholder="OK Liga, Primera Nacional…" {...form.register('competition')} />
              </Field>
              <Field label="Notas" optional className="sm:col-span-2" error={errors.notes?.message}>
                <Textarea maxLength={500} {...form.register('notes')} />
              </Field>
            </div>
          </details>
        </Card>

        {/* Previsualización */}
        <aside className="space-y-4">
          <Card className="relative overflow-hidden p-5" aria-live="polite">
            <div aria-hidden className="track-texture pointer-events-none absolute inset-0" />
            <div className="relative">
              <p className="eyebrow">Previsualización</p>
              {preview ? (
                <>
                  <TargetBreakdownList b={preview} className="mt-3" />
                  <p className="mt-3 border-t border-border/70 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">Objetivo generado</p>
                  <p className="num text-6xl font-bold leading-none text-accent-text">
                    {preview.target}
                    <span className="ml-1 text-xl text-muted">km</span>
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted">Introduce los goles de ambos equipos y las tarjetas (0 si no hubo) para ver el objetivo.</p>
              )}
              <dl className="mt-4 space-y-1.5 border-t border-border/70 pt-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Árbitro</dt>
                  <dd className="truncate font-medium">{referee?.display_name ?? '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Cuenta en</dt>
                  <dd className="text-right font-medium">{period ? formatPeriodRange(period) : '—'}</dd>
                </div>
              </dl>
            </div>
          </Card>

          {duplicate && (
            <p role="alert" className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {referee?.display_name ?? 'Este árbitro'} ya tiene un partido ({duplicate.home_goals}-{duplicate.away_goals}) en ese periodo ({formatPeriodRange(matchPeriodOf(duplicate.match_date))}).{' '}
                <Link to="/historial" className="font-semibold underline">
                  Corrígelo desde el historial
                </Link>
                .
              </span>
            </p>
          )}
          {outOfSeason && (
            <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              Esa semana queda fuera de la temporada «{season!.name}».
            </p>
          )}
          {!online && (
            <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              Sin conexión. Tus datos se conservan en este dispositivo hasta que puedas guardarlos.
            </p>
          )}

          <Button type="submit" block size="lg" disabled={!online || closed || !!duplicate || outOfSeason}>
            <Flag aria-hidden /> Revisar y guardar
          </Button>
        </aside>
      </form>

      <Dialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Confirmar partido"
        description="Revisa que todo es correcto antes de guardar."
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Corregir
            </Button>
            <Button loading={save.isPending} onClick={() => pending && save.mutate(pending)}>
              Guardar partido <ArrowRight aria-hidden />
            </Button>
          </>
        }
      >
        {pending && preview && (
          <dl className="space-y-2 text-sm">
            <Row label="Resultado" value={`${preview.score}${pending.homeTeam || pending.awayTeam ? ` (${pending.homeTeam ?? '—'} vs ${pending.awayTeam ?? '—'})` : ''}`} />
            <Row label="Goles" value={`${preview.goalsKm} km`} />
            <Row label="Tarjetas" value={`${pending.yellowCards ?? 0} amarillas · ${pending.blueCards ?? 0} azules · ${pending.redCards ?? 0} rojas = ${preview.cardsKm} km`} />
            <Row label="Objetivo generado" value={`${preview.target} km`} strong />
            <Row label="Árbitro" value={profileOf(pending.refereeId)?.display_name ?? '—'} />
            <Row label="Fecha del partido" value={formatLongDate(pending.matchDate)} />
            <Row label="Periodo (desde el sábado 9:00)" value={formatPeriodRange(matchPeriodOf(pending.matchDate))} />
          </dl>
        )}
      </Dialog>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 pb-2 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? 'num text-xl font-bold text-accent-text' : 'text-right font-medium'}>{value}</dd>
    </div>
  );
}

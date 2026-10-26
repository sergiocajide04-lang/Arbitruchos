import { z } from 'zod';
import { parseGoals } from '@/domain/calc/goals';
import { isIsoDate } from '@/lib/dates';
import type { MatchInput } from '@/services/api';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((v) => (v === '' ? null : v));

const goals = z.string().superRefine((v, ctx) => {
  const r = parseGoals(v);
  if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error });
});

export const matchFormSchema = z.object({
  matchDate: z.string().refine(isIsoDate, 'Indica la fecha del partido'),
  weekStart: z.string().refine(isIsoDate, 'Elige la semana de cumplimiento'),
  refereeId: z.string().uuid('Elige el árbitro'),
  competition: optionalText(60),
  homeTeam: optionalText(60),
  awayTeam: optionalText(60),
  homeGoals: goals,
  awayGoals: goals,
  notes: optionalText(500),
});

export type MatchFormValues = z.input<typeof matchFormSchema>;
export type MatchFormParsed = z.output<typeof matchFormSchema>;

export function toMatchInput(v: MatchFormParsed): MatchInput {
  const home = parseGoals(v.homeGoals);
  const away = parseGoals(v.awayGoals);
  if (!home.ok || !away.ok) throw new Error('Goles no válidos');
  return {
    referee_id: v.refereeId,
    match_date: v.matchDate,
    week_start: v.weekStart,
    competition: v.competition,
    home_team: v.homeTeam,
    away_team: v.awayTeam,
    home_goals: home.value,
    away_goals: away.value,
    notes: v.notes,
  };
}

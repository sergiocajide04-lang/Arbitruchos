/**
 * Objetivo de un partido: objetivo_km = goles_equipo_1 + goles_equipo_2.
 */

export const MAX_GOALS = 99;

export type GoalParse = { ok: true; value: number } | { ok: false; error: string };

/**
 * Interpreta lo que el usuario escribe en un campo de goles.
 * Un campo vacío NUNCA se interpreta como 0.
 */
export function parseGoals(input: string | number | null | undefined): GoalParse {
  if (input === null || input === undefined) return { ok: false, error: 'Introduce los goles' };
  const raw = String(input).trim();
  if (raw === '') return { ok: false, error: 'Introduce los goles' };
  if (!/^\d+$/.test(raw)) {
    if (/^-/.test(raw)) return { ok: false, error: 'Los goles no pueden ser negativos' };
    return { ok: false, error: 'Usa un número entero' };
  }
  const value = Number(raw);
  if (value > MAX_GOALS) return { ok: false, error: `Máximo ${MAX_GOALS} goles` };
  return { ok: true, value };
}

export function targetFromScore(homeGoals: number, awayGoals: number): number {
  for (const g of [homeGoals, awayGoals]) {
    if (!Number.isInteger(g) || g < 0) throw new RangeError('Los goles deben ser enteros no negativos');
  }
  return homeGoals + awayGoals;
}

/** Previsualización segura: null si alguno de los campos no es válido. */
export function previewTarget(home: string, away: string): { score: string; target: number } | null {
  const h = parseGoals(home);
  const a = parseGoals(away);
  if (!h.ok || !a.ok) return null;
  return { score: `${h.value}-${a.value}`, target: targetFromScore(h.value, a.value) };
}

/**
 * Objetivo de un partido:
 *   objetivo_km = goles_equipo_1 + goles_equipo_2
 *               + amarillas × 1 + azules × 2 + rojas × 5
 * La base de datos calcula la misma fórmula (columna generada matches.target_km).
 */

export const MAX_GOALS = 99;
export const MAX_CARDS = 50;

export const CARD_KM = { yellow: 1, blue: 2, red: 5 } as const;
export type CardColor = keyof typeof CARD_KM;

export const CARD_LABELS: Record<CardColor, string> = {
  yellow: 'Amarillas',
  blue: 'Azules',
  red: 'Rojas',
};

export interface CardCounts {
  yellow: number;
  blue: number;
  red: number;
}

export const NO_CARDS: CardCounts = { yellow: 0, blue: 0, red: 0 };

export type GoalParse = { ok: true; value: number } | { ok: false; error: string };

/** Entero no negativo con tope. Un campo vacío NUNCA se interpreta como 0. */
function parseCount(input: string | number | null | undefined, max: number, what: string, emptyMessage: string): GoalParse {
  if (input === null || input === undefined) return { ok: false, error: emptyMessage };
  const raw = String(input).trim();
  if (raw === '') return { ok: false, error: emptyMessage };
  if (!/^\d+$/.test(raw)) {
    if (/^-/.test(raw)) return { ok: false, error: `${what} no pueden ser negativos` };
    return { ok: false, error: 'Usa un número entero' };
  }
  const value = Number(raw);
  if (value > max) return { ok: false, error: `Máximo ${max}` };
  return { ok: true, value };
}

/** Interpreta lo que el usuario escribe en un campo de goles. */
export function parseGoals(input: string | number | null | undefined): GoalParse {
  const r = parseCount(input, MAX_GOALS, 'Los goles', 'Introduce los goles');
  return !r.ok && r.error === `Máximo ${MAX_GOALS}` ? { ok: false, error: `Máximo ${MAX_GOALS} goles` } : r;
}

/** Interpreta un campo de tarjetas (obligatorio: escribe 0 si no hubo). */
export function parseCards(input: string | number | null | undefined): GoalParse {
  const r = parseCount(input, MAX_CARDS, 'Las tarjetas', 'Indica el número (0 si no hubo)');
  return !r.ok && r.error === 'Las tarjetas no pueden ser negativos' ? { ok: false, error: 'Las tarjetas no pueden ser negativas' } : r;
}

function assertCount(n: number) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError('Los goles y las tarjetas deben ser enteros no negativos');
}

export function cardsKm(cards: CardCounts): number {
  for (const n of [cards.yellow, cards.blue, cards.red]) assertCount(n);
  return cards.yellow * CARD_KM.yellow + cards.blue * CARD_KM.blue + cards.red * CARD_KM.red;
}

export function targetFromScore(homeGoals: number, awayGoals: number, cards: CardCounts = NO_CARDS): number {
  for (const g of [homeGoals, awayGoals]) assertCount(g);
  return homeGoals + awayGoals + cardsKm(cards);
}

export interface TargetBreakdown {
  score: string;
  goalsKm: number;
  yellowKm: number;
  blueKm: number;
  redKm: number;
  cardsKm: number;
  target: number;
}

/** Desglose de un partido ya guardado. */
export function breakdown(m: {
  home_goals: number;
  away_goals: number;
  yellow_cards: number;
  blue_cards: number;
  red_cards: number;
}): TargetBreakdown {
  const cards = { yellow: m.yellow_cards, blue: m.blue_cards, red: m.red_cards };
  return {
    score: `${m.home_goals}-${m.away_goals}`,
    goalsKm: m.home_goals + m.away_goals,
    yellowKm: cards.yellow * CARD_KM.yellow,
    blueKm: cards.blue * CARD_KM.blue,
    redKm: cards.red * CARD_KM.red,
    cardsKm: cardsKm(cards),
    target: targetFromScore(m.home_goals, m.away_goals, cards),
  };
}

/** Previsualización segura: null si alguno de los campos no es válido. */
export function previewTarget(
  home: string,
  away: string,
  cards: { yellow: string; blue: string; red: string } = { yellow: '0', blue: '0', red: '0' },
): TargetBreakdown | null {
  const h = parseGoals(home);
  const a = parseGoals(away);
  const y = parseCards(cards.yellow);
  const b = parseCards(cards.blue);
  const r = parseCards(cards.red);
  if (!h.ok || !a.ok || !y.ok || !b.ok || !r.ok) return null;
  return breakdown({ home_goals: h.value, away_goals: a.value, yellow_cards: y.value, blue_cards: b.value, red_cards: r.value });
}

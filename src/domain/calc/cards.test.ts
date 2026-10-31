import { describe, expect, it } from 'vitest';
import { matchFormSchema, toMatchInput } from '@/features/matches/form';
import { breakdown, cardsKm, parseCards, previewTarget, targetFromScore } from './goals';

describe('objetivo con tarjetas', () => {
  it.each([
    [{ yellow: 0, blue: 0, red: 0 }, 14],
    [{ yellow: 2, blue: 0, red: 0 }, 16],
    [{ yellow: 0, blue: 1, red: 0 }, 16],
    [{ yellow: 0, blue: 0, red: 1 }, 19],
    [{ yellow: 2, blue: 1, red: 1 }, 23],
  ])('13-1 con %o = %i km', (cards, km) => {
    expect(targetFromScore(13, 1, cards)).toBe(km);
  });

  it('desglosa goles y cada tipo de tarjeta', () => {
    expect(breakdown({ home_goals: 13, away_goals: 1, yellow_cards: 2, blue_cards: 1, red_cards: 1 })).toEqual({
      score: '13-1',
      goalsKm: 14,
      yellowKm: 2,
      blueKm: 2,
      redKm: 5,
      cardsKm: 9,
      target: 23,
    });
  });

  it('la previsualización se actualiza con cualquier campo', () => {
    expect(previewTarget('13', '1', { yellow: '2', blue: '1', red: '1' })?.target).toBe(23);
    expect(previewTarget('13', '1', { yellow: '2', blue: '1', red: '0' })?.target).toBe(18);
  });

  it('rechaza negativos y decimales', () => {
    expect(parseCards('-1')).toEqual({ ok: false, error: 'Las tarjetas no pueden ser negativas' });
    expect(parseCards('1.5').ok).toBe(false);
    expect(parseCards('1,5').ok).toBe(false);
    expect(() => cardsKm({ yellow: -1, blue: 0, red: 0 })).toThrow(RangeError);
    expect(() => targetFromScore(13, 1, { yellow: 0.5, blue: 0, red: 0 })).toThrow(RangeError);
  });

  it('un campo vacío no se convierte en cero: pide escribir 0', () => {
    expect(parseCards('')).toEqual({ ok: false, error: 'Indica el número (0 si no hubo)' });
    expect(parseCards(undefined).ok).toBe(false);
    expect(previewTarget('13', '1', { yellow: '', blue: '0', red: '0' })).toBeNull();
  });

  it('el formulario valida y envía las tarjetas', () => {
    const base = {
      matchDate: '2026-10-24',
      weekStart: '2026-10-26',
      refereeId: '11111111-1111-4111-8111-111111111111',
      competition: '',
      homeTeam: '',
      awayTeam: '',
      homeGoals: '13',
      awayGoals: '1',
      notes: '',
    };
    const ok = matchFormSchema.safeParse({ ...base, yellowCards: '2', blueCards: '1', redCards: '1' });
    expect(ok.success).toBe(true);
    expect(toMatchInput(ok.data!)).toMatchObject({ home_goals: 13, away_goals: 1, yellow_cards: 2, blue_cards: 1, red_cards: 1 });
    const bad = matchFormSchema.safeParse({ ...base, yellowCards: '-1', blueCards: '', redCards: '0' });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.map((i) => i.path[0])).toEqual(['yellowCards', 'blueCards']);
  });
});

import { describe, expect, it } from 'vitest';
import { parseOcrLines } from '@/features/ocr/parse';
import { emptyWorkoutForm, formFromOcr, paceWarning, toWorkoutInput, workoutFormSchema, type WorkoutFormValues } from './form';

const today = '2026-10-25';
const schema = workoutFormSchema({ today, requireConfirmation: true });

function values(patch: Partial<WorkoutFormValues>): WorkoutFormValues {
  return { ...emptyWorkoutForm(today), activityType: 'run', source: 'strava', confirmed: true, ...patch };
}

function errorsOf(v: WorkoutFormValues) {
  const r = schema.safeParse(v);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]));
}

describe('formulario de entrenamiento', () => {
  it('exige una distancia positiva y no convierte el vacío en cero', () => {
    expect(errorsOf(values({ distance: '' })).distance).toBe('Introduce la distancia');
    expect(errorsOf(values({ distance: '0' })).distance).toMatch(/mayor que cero/);
    expect(errorsOf(values({ distance: 'abc' })).distance).toMatch(/número/);
  });

  it('acepta coma decimal y normaliza metros a km', () => {
    expect(errorsOf(values({ distance: '8,42' }))).toEqual({});
    const input = toWorkoutInput(values({ distance: '301', distanceUnit: 'm' }), { entryMethod: 'manual' });
    expect(input.distance_km).toBe(0.301);
    expect(input.distance_value).toBe(301);
  });

  it('los campos opcionales vacíos se guardan como desconocidos (null)', () => {
    const input = toWorkoutInput(values({ distance: '5' }), { entryMethod: 'manual' });
    expect(input.duration_s).toBeNull();
    expect(input.avg_pace_s_per_km).toBeNull();
    expect(input.calories).toBeNull();
    expect(input.calories_kind).toBeNull();
    expect(input.avg_speed_kmh).toBeNull();
  });

  it('calcula el ritmo si falta y lo marca como derivado', () => {
    const input = toWorkoutInput(values({ distance: '10', duration: '50:00' }), { entryMethod: 'manual' });
    expect(input.avg_pace_s_per_km).toBe(300);
    expect(input.details.pace_derived).toBe(true);
  });

  it('bloquea un ritmo claramente incoherente y avisa de uno algo desviado', () => {
    expect(errorsOf(values({ distance: '8,42', duration: '48:35', pace: '3:00' })).pace).toMatch(/No cuadra/);
    expect(paceWarning(values({ distance: '8,42', duration: '48:35', pace: '5:15' }))).toMatch(/ritmo sería/);
    expect(paceWarning(values({ distance: '8,42', duration: '48:35', pace: '5:46' }))).toBeNull();
  });

  it('valida formatos de duración y fecha', () => {
    expect(errorsOf(values({ distance: '5', duration: '25:70' })).duration).toBeDefined();
    expect(errorsOf(values({ distance: '5', activityDate: '2026-10-30' })).activityDate).toMatch(/futura/);
  });

  it('requiere confirmación expresa', () => {
    expect(errorsOf(values({ distance: '5', confirmed: false })).confirmed).toBeDefined();
  });

  it('conserva como definitivo el valor corregido por el usuario y anota qué se editó', () => {
    const ocr = parseOcrLines(
      [
        { text: 'Distancia 8,42 km', confidence: 90 },
        { text: 'Tiempo en movimiento 48:35', confidence: 90 },
        { text: 'Strava', confidence: 90 },
      ],
      today,
    );
    const initial = formFromOcr(ocr, today);
    expect(initial.distance).toBe('8,42');
    const edited = { ...initial, activityType: 'run' as const, distance: '8,24', confirmed: true };
    const input = toWorkoutInput(edited, { entryMethod: 'ocr', ocr, initial });
    expect(input.distance_km).toBe(8.24);
    expect(input.details.ocr?.edited_fields).toContain('distance');
    expect(input.entry_method).toBe('ocr');
  });

  it('genera la misma huella para el mismo entrenamiento', () => {
    const a = toWorkoutInput(values({ distance: '8,42', duration: '48:35' }), { entryMethod: 'manual' });
    const b = toWorkoutInput(values({ distance: '8.42', duration: '48:35', source: 'apple' }), { entryMethod: 'ocr' });
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});

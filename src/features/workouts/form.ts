/**
 * Formulario de entrenamiento: valores de texto → datos normalizados.
 * Reglas: distancia estrictamente positiva; los campos vacíos son "desconocidos"
 * (null), nunca cero; ritmo coherente con distancia y duración.
 */
import { z } from 'zod';
import {
  checkPaceConsistency,
  parseDecimalInput,
  parseDurationInput,
  parsePaceInput,
  roundKm,
  toKm,
  workoutFingerprint,
} from '@/domain/calc/workout';
import type { ActivityType, CaloriesKind, DistanceUnit, Workout, WorkoutDetails, WorkoutSource } from '@/domain/types';
import { isIsoDate, type IsoDate } from '@/lib/dates';
import { formatDuration, formatPace } from '@/lib/format';
import type { WorkoutInput } from '@/services/api';
import type { ParsedWorkout } from '@/features/ocr/types';

export interface WorkoutFormValues {
  activityDate: string;
  activityTime: string;
  activityType: ActivityType | '';
  source: WorkoutSource | '';
  distance: string;
  distanceUnit: DistanceUnit;
  duration: string;
  pace: string;
  speed: string;
  calories: string;
  caloriesKind: CaloriesKind | '';
  watts: string;
  confirmed: boolean;
}

export const RUNNING_TYPES: ActivityType[] = ['run', 'treadmill', 'walk'];
export const PACE_BLOCK_DEVIATION = 0.25;

export function emptyWorkoutForm(today: IsoDate): WorkoutFormValues {
  return {
    activityDate: today,
    activityTime: '',
    activityType: '',
    source: '',
    distance: '',
    distanceUnit: 'km',
    duration: '',
    pace: '',
    speed: '',
    calories: '',
    caloriesKind: '',
    watts: '',
    confirmed: false,
  };
}

const decimalStr = (v: number, max = 3) => String(Number(v.toFixed(max))).replace('.', ',');

/** Valores iniciales a partir del resultado del OCR (solo lo detectado; el resto vacío). */
export function formFromOcr(r: ParsedWorkout, today: IsoDate): WorkoutFormValues {
  const base = emptyWorkoutForm(today);
  return {
    ...base,
    activityDate: r.date.value ?? today,
    activityTime: r.time.value ?? '',
    activityType: r.activityType.value ?? '',
    source: r.source.value ?? '',
    distance: r.distance.value ? decimalStr(r.distance.value.value) : '',
    distanceUnit: r.distance.value?.unit ?? 'km',
    duration: r.durationS.value !== null ? formatDuration(r.durationS.value) : '',
    // El ritmo calculado no se rellena: se recalcula al guardar si falta.
    pace: r.paceS.value !== null && r.paceS.status !== 'derived' ? formatPace(r.paceS.value) : '',
    speed: r.speedKmh.value !== null ? decimalStr(r.speedKmh.value, 2) : '',
    calories: r.calories.value !== null ? String(r.calories.value) : '',
    caloriesKind: r.caloriesKind ?? '',
    watts: r.watts.value !== null ? String(r.watts.value) : '',
  };
}

export function formFromWorkout(w: Workout): WorkoutFormValues {
  return {
    activityDate: w.activity_date,
    activityTime: w.activity_time ?? '',
    activityType: w.activity_type,
    source: w.source,
    distance: decimalStr(w.distance_value),
    distanceUnit: w.distance_unit,
    duration: w.duration_s !== null ? formatDuration(w.duration_s) : '',
    pace: w.avg_pace_s_per_km !== null && !w.details.pace_derived ? formatPace(w.avg_pace_s_per_km) : '',
    speed: w.avg_speed_kmh !== null ? decimalStr(w.avg_speed_kmh, 2) : '',
    calories: w.calories !== null ? String(w.calories) : '',
    caloriesKind: w.calories_kind ?? '',
    watts: typeof w.details.watts === 'number' ? String(w.details.watts) : '',
    confirmed: true,
  };
}

export function workoutFormSchema(opts: { today: IsoDate; requireConfirmation: boolean }) {
  return z
    .object({
      activityDate: z.string(),
      activityTime: z.string(),
      activityType: z.string(),
      source: z.string(),
      distance: z.string(),
      distanceUnit: z.enum(['km', 'm', 'mi']),
      duration: z.string(),
      pace: z.string(),
      speed: z.string(),
      calories: z.string(),
      caloriesKind: z.string(),
      watts: z.string(),
      confirmed: z.boolean(),
    })
    .superRefine((v, ctx) => {
      const issue = (path: keyof WorkoutFormValues, message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

      if (!isIsoDate(v.activityDate)) issue('activityDate', 'Indica la fecha de la actividad');
      else if (v.activityDate > opts.today) issue('activityDate', 'La fecha no puede ser futura');
      if (v.activityTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.activityTime)) issue('activityTime', 'Hora no válida');
      if (!v.activityType) issue('activityType', 'Elige el tipo de actividad');
      if (!v.source) issue('source', 'Elige la fuente');

      const distance = parseDecimalInput(v.distance);
      if (v.distance.trim() === '') issue('distance', 'Introduce la distancia');
      else if (distance === null) issue('distance', 'Usa un número, p. ej. 8,42');
      else if (distance <= 0) issue('distance', 'La distancia debe ser mayor que cero');
      else if (toKm(distance, v.distanceUnit as DistanceUnit) > 300) issue('distance', 'Distancia demasiado alta');
      else if (roundKm(toKm(distance, v.distanceUnit as DistanceUnit)) <= 0) issue('distance', 'Distancia demasiado pequeña');

      const duration = v.duration.trim() ? parseDurationInput(v.duration) : null;
      if (v.duration.trim() && duration === null) issue('duration', 'Formato hh:mm:ss o mm:ss');

      const pace = v.pace.trim() ? parsePaceInput(v.pace) : null;
      if (v.pace.trim() && pace === null) issue('pace', 'Formato m:ss (p. ej. 5:46)');
      else if (pace !== null && (pace < 60 || pace > 3600)) issue('pace', 'Ritmo fuera de rango');

      if (v.speed.trim()) {
        const speed = parseDecimalInput(v.speed);
        if (speed === null || speed <= 0 || speed > 80) issue('speed', 'Velocidad no válida');
      }
      if (v.calories.trim() && !/^\d{1,5}$/.test(v.calories.trim())) issue('calories', 'Usa un número entero');
      if (v.watts.trim() && !/^\d{1,4}$/.test(v.watts.trim())) issue('watts', 'Usa un número entero');

      // Coherencia ritmo/distancia/duración en actividades a pie.
      if (distance && distance > 0 && duration && pace && RUNNING_TYPES.includes(v.activityType as ActivityType)) {
        const km = toKm(distance, v.distanceUnit as DistanceUnit);
        const check = checkPaceConsistency(km, duration, pace);
        if (check.deviation > PACE_BLOCK_DEVIATION) {
          issue('pace', `No cuadra con distancia y tiempo (serían ${formatPace(check.derivedPace)} /km)`);
        }
      }

      if (opts.requireConfirmation && !v.confirmed) issue('confirmed', 'Confirma que has revisado los datos');
    });
}

/** Aviso no bloqueante si el ritmo se desvía ligeramente. */
export function paceWarning(v: WorkoutFormValues): string | null {
  const distance = parseDecimalInput(v.distance);
  const duration = parseDurationInput(v.duration);
  const pace = parsePaceInput(v.pace);
  if (!distance || !duration || !pace) return null;
  const check = checkPaceConsistency(toKm(distance, v.distanceUnit), duration, pace);
  if (check.consistent || check.deviation > PACE_BLOCK_DEVIATION) return null;
  return `Con esa distancia y tiempo el ritmo sería ${formatPace(check.derivedPace)} /km. Puede deberse a pausas; revísalo.`;
}

/** Convierte el formulario validado en los datos que se guardan. */
export function toWorkoutInput(
  v: WorkoutFormValues,
  meta: { entryMethod: 'ocr' | 'manual'; ocr?: ParsedWorkout | null; initial?: WorkoutFormValues | null; baseDetails?: WorkoutDetails },
): WorkoutInput {
  const distanceValue = parseDecimalInput(v.distance)!;
  const unit = v.distanceUnit;
  const distanceKm = roundKm(toKm(distanceValue, unit));
  const durationS = parseDurationInput(v.duration);
  const typedPace = parsePaceInput(v.pace);
  const derivedPace = durationS !== null ? Math.round((durationS / distanceKm) * 10) / 10 : null;
  const pace = typedPace ?? (derivedPace !== null && derivedPace >= 60 && derivedPace <= 3600 ? derivedPace : null);
  const speed = parseDecimalInput(v.speed);
  const calories = v.calories.trim() ? Number(v.calories.trim()) : null;
  const watts = v.watts.trim() ? Number(v.watts.trim()) : null;

  const details: WorkoutDetails = { ...(meta.baseDetails ?? {}) };
  delete details.watts;
  delete details.pace_derived;
  if (watts !== null) details.watts = watts;
  if (typedPace === null && pace !== null) details.pace_derived = true;
  if (meta.ocr && meta.initial) {
    const edited = (Object.keys(meta.initial) as Array<keyof WorkoutFormValues>).filter(
      (k) => k !== 'confirmed' && String(meta.initial![k]) !== String(v[k]),
    );
    details.ocr = {
      engine: 'tesseract.js',
      detected_source: meta.ocr.source.value,
      edited_fields: edited,
      mean_confidence: Math.round(meta.ocr.meanConfidence * 100) / 100,
    };
    if (meta.ocr.caloriesTotal !== null && v.caloriesKind === 'active') details.calories_total = meta.ocr.caloriesTotal;
  }

  return {
    activity_date: v.activityDate,
    activity_time: v.activityTime || null,
    activity_type: v.activityType as ActivityType,
    source: v.source as WorkoutSource,
    entry_method: meta.entryMethod,
    distance_value: distanceValue,
    distance_unit: unit,
    distance_km: distanceKm,
    duration_s: durationS,
    avg_pace_s_per_km: pace,
    avg_speed_kmh: speed,
    calories,
    calories_kind: calories !== null ? ((v.caloriesKind || 'unknown') as CaloriesKind) : null,
    fingerprint: workoutFingerprint({ activityDate: v.activityDate, distanceKm, durationS }),
    details,
  };
}

/**
 * Validación cruzada de distancia, duración, ritmo y velocidad.
 * Marca como dudosos los campos incoherentes en lugar de corregirlos en silencio.
 */
import { checkPaceConsistency, checkSpeedConsistency } from '@/domain/calc/workout';
import { formatKm, formatPace } from '@/lib/format';
import type { ParsedWorkout } from './types';

const MIN_PACE = 120; // 2:00 /km
const MAX_PACE = 1200; // 20:00 /km

interface Hints {
  /** Duración alternativa si el reloj mm:ss fuera en realidad h:mm. */
  durationAlt: number | null;
  /** Otros valores candidatos a duración (p. ej. tiempo transcurrido vs. en movimiento). */
  durationAlternatives: number[];
}

function flag(field: { status: string; note?: string }, note: string) {
  field.status = 'uncertain';
  field.note = field.note ? `${field.note}. ${note}` : note;
}

export function crossValidate(r: ParsedWorkout, hints: Hints): void {
  // Ceros: se muestran para revisión, no se dan por buenos ni por erróneos.
  if (r.distance.value && r.distance.value.km === 0) flag(r.distance, 'El valor es cero: revisa la captura');
  if (r.durationS.value === 0) flag(r.durationS, 'El valor es cero: revisa la captura');
  if (r.speedKmh.value === 0) flag(r.speedKmh, 'El valor es cero');
  if (r.calories.value === 0) flag(r.calories, 'El valor es cero');

  const km = r.distance.value?.km ?? null;
  const usableKm = km !== null && km > 0 ? km : null;

  // Distancia + duración + ritmo
  if (usableKm !== null && r.durationS.value && r.paceS.value) {
    const check = checkPaceConsistency(usableKm, r.durationS.value, r.paceS.value);
    if (!check.consistent) {
      const options = [hints.durationAlt, ...hints.durationAlternatives].filter((v): v is number => v !== null && v > 0);
      const fit = options.find((d) => checkPaceConsistency(usableKm, d, r.paceS.value!).consistent);
      if (fit !== undefined) {
        r.durationS.value = fit;
        flag(r.durationS, 'Elegido el tiempo coherente con distancia y ritmo');
      } else {
        flag(r.distance, 'No cuadra con el tiempo y el ritmo');
        flag(r.durationS, 'No cuadra con la distancia y el ritmo');
        flag(r.paceS, 'No cuadra con la distancia y el tiempo');
        r.warnings.push('Distancia, tiempo y ritmo no son coherentes entre sí. Revisa los tres valores.');
      }
    }
  } else if (usableKm !== null && r.durationS.value && !r.paceS.value) {
    // Ritmo derivado (claramente marcado como calculado).
    r.paceS = {
      value: r.durationS.value / usableKm,
      confidence: Math.min(r.distance.confidence, r.durationS.confidence),
      status: 'derived',
      note: 'Calculado a partir de distancia y tiempo',
    };
  } else if (usableKm === null && r.durationS.value && r.paceS.value) {
    r.distance.note = `Según tiempo y ritmo serían unos ${formatKm(r.durationS.value / r.paceS.value, true)} km. Introdúcelo si es correcto.`;
  }

  // Velocidad
  if (usableKm !== null && r.durationS.value && r.speedKmh.value) {
    const check = checkSpeedConsistency(usableKm, r.durationS.value, r.speedKmh.value);
    if (!check.consistent) flag(r.speedKmh, 'No cuadra con distancia y tiempo');
  }

  // Plausibilidad para carrera a pie
  if (r.paceS.value && (r.paceS.value < MIN_PACE || r.paceS.value > MAX_PACE)) {
    if (r.activityType.value === 'run' || r.activityType.value === 'treadmill' || r.activityType.value === null) {
      flag(r.paceS, `Ritmo poco habitual (${formatPace(r.paceS.value)} /km)`);
    }
  }
  if (km !== null && km > 100) flag(r.distance, 'Distancia inusualmente alta');
  if (r.distance.value?.unit === 'm' && km !== null && km < 0.2) flag(r.distance, 'Distancia muy corta');

  if (r.meanConfidence > 0 && r.meanConfidence < 0.55) {
    r.warnings.push('La lectura tiene poca confianza (imagen borrosa o con poco contraste). Revisa todos los campos.');
  }
}

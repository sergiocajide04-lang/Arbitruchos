/**
 * Identificación de campos a partir de las líneas reconocidas.
 *
 * Estrategia:
 *  1. Se normaliza cada línea y se extraen tokens tipados (ver numbers.ts).
 *  2. Se localizan etiquetas conocidas (es/en) de cada campo.
 *  3. Cada par (campo, token) recibe una puntuación según el tipo del token y su
 *     relación con la etiqueta (misma línea, línea superior/inferior alineada).
 *  4. Asignación voraz por puntuación: un token solo se usa para un campo.
 *  5. Validación cruzada (validate.ts) y estado de cada campo.
 * Nunca se inventan valores: si no hay candidato suficientemente fiable, el
 * campo queda vacío y el usuario debe completarlo.
 */
import type { ActivityType, CaloriesKind, WorkoutSource } from '@/domain/types';
import { addDays, isIsoDate, type IsoDate } from '@/lib/dates';
import { distanceToKm, extractTokens, fixNumericConfusions, normalizeText, type Token, type TokenKind } from './numbers';
import type { DistanceValue, OcrField, OcrLine, ParsedWorkout } from './types';
import { crossValidate } from './validate';

type FieldKey =
  | 'distance'
  | 'duration'
  | 'pace'
  | 'speed'
  | 'caloriesActive'
  | 'caloriesTotal'
  | 'calories'
  | 'watts'
  | 'ignore';

interface LabelDef {
  field: FieldKey;
  phrase: string;
  weight: number;
}

const LABELS: LabelDef[] = ([
  // Distancia
  { field: 'distance', phrase: 'distancia', weight: 1 },
  { field: 'distance', phrase: 'distance', weight: 1 },
  { field: 'distance', phrase: 'dist', weight: 0.9 },
  // Duración (prioridad al tiempo en movimiento / de entrenamiento)
  { field: 'duration', phrase: 'tiempo en movimiento', weight: 1 },
  { field: 'duration', phrase: 'moving time', weight: 1 },
  { field: 'duration', phrase: 'tiempo de entrenamiento', weight: 1 },
  { field: 'duration', phrase: 'workout time', weight: 1 },
  { field: 'duration', phrase: 'tiempo transcurrido', weight: 0.85 },
  { field: 'duration', phrase: 'elapsed time', weight: 0.85 },
  { field: 'duration', phrase: 'tiempo total', weight: 0.9 },
  { field: 'duration', phrase: 'total time', weight: 0.9 },
  { field: 'duration', phrase: 'duracion', weight: 1 },
  { field: 'duration', phrase: 'duration', weight: 1 },
  { field: 'duration', phrase: 'elapsed', weight: 0.9 },
  { field: 'duration', phrase: 'tiempo', weight: 0.9 },
  { field: 'duration', phrase: 'time', weight: 0.9 },
  // Ritmo
  { field: 'pace', phrase: 'ritmo medio', weight: 1 },
  { field: 'pace', phrase: 'ritmo promedio', weight: 1 },
  { field: 'pace', phrase: 'avg. pace', weight: 1 },
  { field: 'pace', phrase: 'avg pace', weight: 1 },
  { field: 'pace', phrase: 'average pace', weight: 1 },
  { field: 'pace', phrase: 'ritmo', weight: 0.95 },
  { field: 'pace', phrase: 'pace', weight: 0.95 },
  // Velocidad
  { field: 'speed', phrase: 'velocidad media', weight: 1 },
  { field: 'speed', phrase: 'avg speed', weight: 1 },
  { field: 'speed', phrase: 'velocidad', weight: 0.95 },
  { field: 'speed', phrase: 'speed', weight: 0.95 },
  // Calorías
  { field: 'caloriesActive', phrase: 'calorias activas', weight: 1 },
  { field: 'caloriesActive', phrase: 'kilocalorias activas', weight: 1 },
  { field: 'caloriesActive', phrase: 'active calories', weight: 1 },
  { field: 'caloriesActive', phrase: 'active kilocalories', weight: 1 },
  { field: 'caloriesActive', phrase: 'active energy', weight: 1 },
  { field: 'caloriesTotal', phrase: 'calorias totales', weight: 1 },
  { field: 'caloriesTotal', phrase: 'kilocalorias totales', weight: 1 },
  { field: 'caloriesTotal', phrase: 'total calories', weight: 1 },
  { field: 'caloriesTotal', phrase: 'total kilocalories', weight: 1 },
  { field: 'calories', phrase: 'calorias', weight: 1 },
  { field: 'calories', phrase: 'calories', weight: 1 },
  { field: 'calories', phrase: 'kcal', weight: 0.9 },
  { field: 'calories', phrase: 'cal', weight: 0.85 },
  // Vatios
  { field: 'watts', phrase: 'vatios', weight: 1 },
  { field: 'watts', phrase: 'watts', weight: 1 },
  { field: 'watts', phrase: 'potencia', weight: 0.9 },
  { field: 'watts', phrase: 'power', weight: 0.9 },
  // Métricas que NO se registran: sus valores no deben confundirse con otros campos
  { field: 'ignore', phrase: 'desnivel positivo', weight: 1 },
  { field: 'ignore', phrase: 'desnivel', weight: 1 },
  { field: 'ignore', phrase: 'elevation gain', weight: 1 },
  { field: 'ignore', phrase: 'elevation', weight: 1 },
  { field: 'ignore', phrase: 'elev gain', weight: 1 },
  { field: 'ignore', phrase: 'altitud', weight: 1 },
  { field: 'ignore', phrase: 'frecuencia cardiaca', weight: 1 },
  { field: 'ignore', phrase: 'heart rate', weight: 1 },
  { field: 'ignore', phrase: 'cadencia', weight: 1 },
  { field: 'ignore', phrase: 'cadence', weight: 1 },
  { field: 'ignore', phrase: 'pasos', weight: 1 },
  { field: 'ignore', phrase: 'steps', weight: 1 },
  { field: 'ignore', phrase: 'level', weight: 0.9 },
  { field: 'ignore', phrase: 'nivel', weight: 0.9 },
  { field: 'ignore', phrase: 'interval', weight: 0.9 },
  { field: 'ignore', phrase: 'round', weight: 0.9 },
  { field: 'ignore', phrase: 'esfuerzo', weight: 0.9 },
  { field: 'ignore', phrase: 'kudos', weight: 0.9 },
] satisfies LabelDef[]).sort((a, b) => b.phrase.length - a.phrase.length);

/** Tokens que puede aceptar cada campo y su puntuación base (sin etiqueta). */
const ACCEPTS: Record<FieldKey, Partial<Record<TokenKind, number>>> = {
  distance: { distance: 0.6, number: 0 },
  duration: { duration: 0.55, clock: 0.3 },
  pace: { pace: 0.65, clock: 0.05 },
  speed: { speed: 0.6, number: 0 },
  caloriesActive: { calories: 0.3, number: 0 },
  caloriesTotal: { calories: 0.3, number: 0 },
  calories: { calories: 0.5, number: 0 },
  watts: { watts: 0.55, number: 0 },
  ignore: { distance: 0.3, number: 0.3, clock: 0.3, duration: 0.3, calories: 0.3, speed: 0.3, watts: 0.3 },
};

const ACCEPT_THRESHOLD = 0.45;
const OK_THRESHOLD = 0.6;

interface Located<T> {
  line: number;
  relX: number;
  item: T;
}

interface Candidate {
  field: FieldKey;
  token: Token;
  line: number;
  score: number;
  confidence: number; // 0-1 OCR
}

/** Posición horizontal relativa (0-1) del carácter `index` de la línea. */
function relativeX(line: OcrLine, normText: string, index: number): number {
  if (line.words && line.words.length > 0 && line.pageWidth) {
    let cursor = 0;
    for (const w of line.words) {
      const wl = normalizeText(w.text);
      const at = normText.indexOf(wl, cursor);
      if (at === -1) continue;
      if (index >= at && index < at + wl.length) return (w.x0 + w.x1) / 2 / line.pageWidth;
      cursor = at + wl.length;
      if (at > index) return (w.x0 + w.x1) / 2 / line.pageWidth;
    }
  }
  return normText.length > 0 ? index / normText.length : 0.5;
}

function wordConfidence(line: OcrLine, normText: string, start: number, end: number): number {
  if (!line.words || line.words.length === 0) return line.confidence / 100;
  const confs: number[] = [];
  let cursor = 0;
  for (const w of line.words) {
    const wl = normalizeText(w.text);
    const at = normText.indexOf(wl, cursor);
    if (at === -1) continue;
    cursor = at + wl.length;
    if (at < end && at + wl.length > start) confs.push(w.confidence);
  }
  return (confs.length ? Math.min(...confs) : line.confidence) / 100;
}

function findLabels(text: string): Array<{ def: LabelDef; start: number; end: number }> {
  const found: Array<{ def: LabelDef; start: number; end: number }> = [];
  const taken = new Array<boolean>(text.length).fill(false);
  for (const def of LABELS) {
    const re = new RegExp(`(^|[^a-z])(${def.phrase.replace(/[.]/g, '\\.?')})(?![a-z])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index + m[1]!.length;
      const end = start + m[2]!.length;
      let overlap = false;
      for (let i = start; i < end; i++) if (taken[i]) overlap = true;
      if (overlap) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      found.push({ def, start, end });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

export interface PreparedLine {
  source: OcrLine;
  text: string;
  tokens: Array<Located<Token>>;
  labels: Array<Located<{ def: LabelDef; start: number; end: number }>>;
}

export function prepareLines(lines: readonly OcrLine[]): PreparedLine[] {
  return lines.map((source, lineIndex) => {
    const text = fixNumericConfusions(normalizeText(source.text));
    const tokens = extractTokens(text).map((item) => ({
      line: lineIndex,
      relX: relativeX(source, text, (item.start + item.end) / 2),
      item,
    }));
    const labels = findLabels(text).map((item) => ({
      line: lineIndex,
      relX: relativeX(source, text, (item.start + item.end) / 2),
      item,
    }));
    return { source, text, tokens, labels };
  });
}

/** Puntuación por etiqueta: misma línea (anterior al valor) o líneas vecinas alineadas. */
function labelScore(field: FieldKey, tok: Located<Token>, lines: PreparedLine[]): number {
  let best = 0;
  const same = lines[tok.line]!;
  // Misma línea: cuenta la etiqueta más cercana que precede al token.
  const preceding = same.labels.filter((l) => l.item.end <= tok.item.start);
  const nearest = preceding[preceding.length - 1];
  if (nearest && nearest.item.def.field === field) {
    const gap = tok.item.start - nearest.item.end;
    best = Math.max(best, (gap <= 12 ? 0.5 : 0.4) * nearest.item.def.weight);
  }
  // Etiqueta inmediatamente después en la misma línea (formato "8,42 km distancia").
  const following = same.labels.find((l) => l.item.start >= tok.item.end);
  if (following && following.item.def.field === field && following.item.start - tok.item.end <= 3 && !nearest) {
    best = Math.max(best, 0.4 * following.item.def.weight);
  }

  const neighbours: Array<[number, number]> = [
    [-1, 0.45],
    [1, 0.38],
    [-2, 0.25],
  ];
  for (const [offset, factor] of neighbours) {
    const other = lines[tok.line + offset];
    if (!other || other.labels.length === 0) continue;
    // En la línea vecina, la etiqueta más alineada horizontalmente.
    let closest: PreparedLine['labels'][number] | null = null;
    let dx = Infinity;
    for (const l of other.labels) {
      const d = Math.abs(l.relX - tok.relX);
      if (d < dx) {
        dx = d;
        closest = l;
      }
    }
    if (!closest) continue;
    // Si la etiqueta vecina va seguida de su propio valor en su línea, es una
    // fila "etiqueta valor" y no una cabecera de columna.
    const labelEnd = closest.item.end;
    const nextLabelStart = other.labels.find((l) => l.item.start >= labelEnd)?.item.start ?? Infinity;
    const labelHasOwnValue = other.tokens.some((t) => t.item.start >= labelEnd && t.item.start < nextLabelStart);
    if (closest.item.def.field === field && dx <= 0.3 && !labelHasOwnValue) {
      const alignment = dx <= 0.12 ? 1 : 0.75;
      best = Math.max(best, factor * alignment * closest.item.def.weight);
    }
  }
  return best;
}

function emptyField<T>(): OcrField<T> {
  return { value: null, confidence: 0, status: 'missing' };
}

function statusFor(confidence: number): 'ok' | 'uncertain' {
  return confidence >= OK_THRESHOLD ? 'ok' : 'uncertain';
}

// ---------------------------------------------------------------------------
// Fuente, tipo de actividad, fecha
// ---------------------------------------------------------------------------

export function detectSource(fullText: string, lines: readonly OcrLine[]): OcrField<WorkoutSource> {
  const t = normalizeText(fullText);
  const has = (re: RegExp) => re.test(t);
  if (has(/\bstrava\b/)) return { value: 'strava', confidence: 0.95, status: 'ok' };
  if (has(/apple|fitness\b|kilocalorias activas|active kilocalories|calorias activas|tiempo de entrenamiento|workout time/)) {
    return { value: 'apple', confidence: 0.8, status: 'ok' };
  }
  if (has(/tiempo en movimiento|moving time|kudos|desnivel positivo|elevation gain/)) {
    return { value: 'strava', confidence: 0.6, status: 'uncertain', note: 'Parece una captura de Strava' };
  }
  const upperLines = lines.filter((l) => {
    const letters = l.text.replace(/[^A-Za-z]/g, '');
    return letters.length >= 3 && letters === letters.toUpperCase();
  }).length;
  if (has(/assault|airrunner|assaultrunner|\bwatts\b|\belapsed\b/) || upperLines >= 3) {
    return { value: 'gym_console', confidence: 0.6, status: 'uncertain', note: 'Parece la consola de una máquina' };
  }
  return emptyField();
}

export function detectActivityType(fullText: string): OcrField<ActivityType> {
  const t = normalizeText(fullText);
  const rules: Array<[RegExp, ActivityType]> = [
    [/\b(cinta|treadmill|indoor run|carrera en interior|carrera en cinta|assault ?runner|airrunner)\b/, 'treadmill'],
    [/\b(remo|rowing|rower|row)\b/, 'row'],
    [/\b(eliptica|elliptical)\b/, 'elliptical'],
    [/\b(bici|bicicleta|bike|cycling|ciclismo|ride|airbike|assault ?bike)\b/, 'bike'],
    [/\b(caminata|walk|walking|caminar)\b/, 'walk'],
    [/\b(carrera|run|running|correr|outdoor run|carrera al aire libre)\b/, 'run'],
  ];
  for (const [re, type] of rules) {
    if (re.test(t)) return { value: type, confidence: 0.7, status: 'ok' };
  }
  return emptyField();
}

const MONTHS: Record<string, number> = {
  enero: 1, ene: 1, january: 1, jan: 1,
  febrero: 2, feb: 2, february: 2,
  marzo: 3, mar: 3, march: 3,
  abril: 4, abr: 4, april: 4, apr: 4,
  mayo: 5, may: 5,
  junio: 6, jun: 6, june: 6,
  julio: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, september: 9,
  octubre: 10, oct: 10, october: 10,
  noviembre: 11, nov: 11, november: 11,
  diciembre: 12, dic: 12, december: 12, dec: 12,
};

function buildDate(y: number, m: number, d: number): IsoDate | null {
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

/** Busca una fecha de actividad. Sin año: se asume el año de `today` (o el anterior si quedaría en el futuro). */
export function detectDate(fullText: string, today: IsoDate): OcrField<IsoDate> {
  const t = normalizeText(fullText);
  const thisYear = Number(today.slice(0, 4));
  const withYear = (d: number, m: number, y: number | null): { date: IsoDate; hadYear: boolean } | null => {
    if (y !== null) {
      const full = y < 100 ? 2000 + y : y;
      const date = buildDate(full, m, d);
      return date ? { date, hadYear: true } : null;
    }
    let date = buildDate(thisYear, m, d);
    if (date && date > today) date = buildDate(thisYear - 1, m, d);
    return date ? { date, hadYear: false } : null;
  };

  const found: Array<{ date: IsoDate; hadYear: boolean }> = [];
  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

  // 20 de octubre de 2026 · 20 oct 2026 · 20 octubre
  const esRe = new RegExp(String.raw`\b(\d{1,2})\s*(?:de\s+)?(${monthNames})\.?(?:\s*(?:de\s+)?(\d{4}))?\b`, 'g');
  // October 20, 2026 · Oct 20
  const enRe = new RegExp(String.raw`\b(${monthNames})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b`, 'g');
  // 20/10/2026 · 20-10-26 · 2026-10-20
  const numRe = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b|\b(\d{4})-(\d{2})-(\d{2})\b/g;

  let m: RegExpExecArray | null;
  while ((m = esRe.exec(t)) !== null) {
    const r = withYear(Number(m[1]), MONTHS[m[2]!]!, m[3] ? Number(m[3]) : null);
    if (r) found.push(r);
  }
  while ((m = enRe.exec(t)) !== null) {
    const r = withYear(Number(m[2]), MONTHS[m[1]!]!, m[3] ? Number(m[3]) : null);
    if (r) found.push(r);
  }
  while ((m = numRe.exec(t)) !== null) {
    const r = m[4]
      ? withYear(Number(m[6]), Number(m[5]), Number(m[4]))
      : withYear(Number(m[1]), Number(m[2]), Number(m[3]));
    if (r) found.push(r);
  }

  const valid = found.filter((f) => f.date <= addDays(today, 1));
  if (valid.length > 0) {
    const best = valid.find((f) => f.hadYear) ?? valid[0]!;
    return {
      value: best.date,
      confidence: best.hadYear ? 0.8 : 0.6,
      status: best.hadYear ? 'ok' : 'uncertain',
      note: best.hadYear ? undefined : 'La captura no muestra el año',
    };
  }
  if (/\b(hoy|today)\b/.test(t)) return { value: today, confidence: 0.6, status: 'uncertain', note: 'Detectado "hoy"' };
  if (/\b(ayer|yesterday)\b/.test(t)) {
    return { value: addDays(today, -1), confidence: 0.6, status: 'uncertain', note: 'Detectado "ayer"' };
  }
  return emptyField();
}

// ---------------------------------------------------------------------------
// Análisis principal
// ---------------------------------------------------------------------------

export function parseOcrLines(rawLines: readonly OcrLine[], today: IsoDate): ParsedWorkout {
  const lines = prepareLines(rawLines.filter((l) => l.text.trim().length > 0));
  const fullText = rawLines.map((l) => l.text).join('\n');

  const candidates: Candidate[] = [];
  for (const line of lines) {
    for (const tok of line.tokens) {
      if (tok.item.kind === 'timeOfDay') continue;
      for (const field of Object.keys(ACCEPTS) as FieldKey[]) {
        const base = ACCEPTS[field][tok.item.kind];
        if (base === undefined) continue;
        const score = base + labelScore(field, tok, lines);
        if (score < ACCEPT_THRESHOLD) continue;
        candidates.push({
          field,
          token: tok.item,
          line: tok.line,
          score,
          confidence: wordConfidence(line.source, line.text, tok.item.start, tok.item.end),
        });
      }
    }
  }

  // Asignación voraz por puntuación
  candidates.sort((a, b) => b.score - a.score);
  const usedTokens = new Set<Token>();
  const assigned = new Map<FieldKey, Candidate>();
  const alternatives = new Map<FieldKey, Candidate[]>();
  for (const c of candidates) {
    if (c.field !== 'ignore') {
      const list = alternatives.get(c.field) ?? [];
      list.push(c);
      alternatives.set(c.field, list);
    }
    if (usedTokens.has(c.token)) continue;
    if (c.field === 'ignore') {
      usedTokens.add(c.token);
      continue;
    }
    if (assigned.has(c.field)) continue;
    assigned.set(c.field, c);
    usedTokens.add(c.token);
  }

  const usedTokensFor = (a: Candidate, key: FieldKey) =>
    [...assigned.entries()].some(([k, c]) => k !== key && c.token === a.token);

  const toField = <T>(key: FieldKey, map: (c: Candidate) => T | null): OcrField<T> => {
    const c = assigned.get(key);
    if (!c) return emptyField();
    const value = map(c);
    if (value === null) return emptyField();
    const confidence = Math.min(1, c.score) * c.confidence;
    const field: OcrField<T> = { value, confidence, status: statusFor(confidence), raw: c.token.raw };
    if (c.token.ambiguous) {
      field.status = 'uncertain';
      field.note = 'El separador decimal es ambiguo';
    }
    // Otro candidato casi igual de bueno con un valor distinto → dudoso
    const rival = (alternatives.get(key) ?? []).find(
      (a) => a.token !== c.token && !usedTokensFor(a, key) && Math.abs(a.score - c.score) < 0.08 && a.token.value !== c.token.value,
    );
    if (rival) {
      field.status = 'uncertain';
      field.note = `También se ha leído «${rival.token.raw}»`;
    }
    return field;
  };

  // Distancia
  const distance = toField<DistanceValue>('distance', (c) => {
    if (c.token.kind === 'distance' && c.token.unit) {
      return { value: c.token.value, unit: c.token.unit, km: distanceToKm(c.token.value, c.token.unit) };
    }
    // Número sin unidad junto a la etiqueta: se infiere la unidad y se marca como dudoso.
    const t = normalizeText(fullText);
    const unit = /\bmi(les)?\b/.test(t) && !/\bkm\b/.test(t) ? 'mi' : Number.isInteger(c.token.value) && c.token.value >= 100 ? 'm' : 'km';
    return { value: c.token.value, unit, km: distanceToKm(c.token.value, unit) };
  });
  const distanceCandidate = assigned.get('distance');
  if (distance.value && distanceCandidate && distanceCandidate.token.kind !== 'distance') {
    distance.status = 'uncertain';
    distance.note = 'No se ve la unidad: confirma si son km o metros';
  }

  // Duración y ritmo
  const durationS = toField<number>('duration', (c) => c.token.value);
  const paceS = toField<number>('pace', (c) => c.token.value);
  const durationCandidate = assigned.get('duration');

  const speedKmh = toField<number>('speed', (c) => c.token.value);
  const speedCandidate = assigned.get('speed');
  if (speedKmh.value !== null && speedCandidate?.token.kind === 'number') {
    speedKmh.status = 'uncertain';
    speedKmh.note = 'Unidad supuesta: km/h';
  }

  // Calorías: nunca se confunden activas con totales
  const active = toField<number>('caloriesActive', (c) => c.token.value);
  const total = toField<number>('caloriesTotal', (c) => c.token.value);
  const generic = toField<number>('calories', (c) => c.token.value);
  let calories: OcrField<number>;
  let caloriesKind: CaloriesKind | null = null;
  if (active.value !== null) {
    calories = active;
    caloriesKind = 'active';
  } else if (total.value !== null) {
    calories = total;
    caloriesKind = 'total';
  } else {
    calories = generic;
    caloriesKind = generic.value !== null ? 'unknown' : null;
  }

  const watts = toField<number>('watts', (c) => c.token.value);

  // Hora del día
  let time: OcrField<string> = emptyField();
  for (const line of lines) {
    const tod = line.tokens.find((t) => t.item.kind === 'timeOfDay');
    if (tod?.item.text) {
      time = { value: tod.item.text, confidence: 0.7, status: 'ok', raw: tod.item.raw };
      break;
    }
  }

  const confs = rawLines.filter((l) => l.text.trim()).map((l) => l.confidence);
  const result: ParsedWorkout = {
    source: detectSource(fullText, rawLines),
    activityType: detectActivityType(fullText),
    distance,
    durationS,
    paceS,
    speedKmh,
    calories,
    caloriesKind,
    caloriesTotal: active.value !== null && total.value !== null ? total.value : null,
    watts,
    date: detectDate(fullText, today),
    time,
    warnings: [],
    meanConfidence: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length / 100 : 0,
    lineCount: lines.length,
  };

  crossValidate(result, {
    durationAlt: durationCandidate?.token.kind === 'clock' ? durationCandidate.token.altValue ?? null : null,
    durationAlternatives: (alternatives.get('duration') ?? [])
      .filter((a) => a.token !== durationCandidate?.token)
      .map((a) => a.token.value),
  });

  if (lines.length === 0) result.warnings.push('No se ha reconocido texto en la imagen.');
  return result;
}

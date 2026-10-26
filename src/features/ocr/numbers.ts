/**
 * Normalización de texto OCR y extracción de valores tipados (distancias,
 * duraciones, ritmos, velocidades, calorías, vatios y números sueltos).
 * Admite formato español (8,42) e internacional (8.42).
 */
import type { DistanceUnit } from '@/domain/types';

export type TokenKind =
  | 'pace'
  | 'speed'
  | 'duration' // h:mm:ss o "1 h 05 min"
  | 'clock' // mm:ss ambiguo (duración o ritmo según la etiqueta)
  | 'distance'
  | 'calories'
  | 'watts'
  | 'number'
  | 'timeOfDay';

export interface Token {
  kind: TokenKind;
  /** Valor normalizado: km, s, s/km, km/h, kcal, W o número. */
  value: number;
  unit?: DistanceUnit;
  start: number;
  end: number;
  raw: string;
  /** Interpretación numérica dudosa (p. ej. "1.234 km"). */
  ambiguous?: boolean;
  /** Para relojes mm:ss: valor alternativo si fuera h:mm. */
  altValue?: number;
  /** Texto horario "HH:MM". */
  text?: string;
}

/** Minúsculas, sin acentos y con símbolos tipográficos unificados. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2019\u2018\u00b4`]/g, "'")
    .replace(/[\u201d\u201c\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00a0/g, ' ');
}

const DIGITISH = /[0-9]/;

/**
 * Corrige confusiones típicas del OCR SOLO cuando el carácter está pegado a una
 * cifra o a un separador numérico: O→0, l/I/|→1. Implementado sin lookbehind
 * para compatibilidad con Safari antiguos.
 */
export function fixNumericConfusions(text: string): string {
  const chars = [...text];
  const isNumCtx = (c: string | undefined) => c !== undefined && (DIGITISH.test(c) || c === ':' || c === ',' || c === '.');
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (!'oOlI|'.includes(c)) continue;
    const prev = chars[i - 1];
    const next = chars[i + 1];
    const prevIsDigit = prev !== undefined && DIGITISH.test(prev);
    const nextIsDigit = next !== undefined && DIGITISH.test(next);
    // Exige una cifra a un lado y contexto numérico al otro (o el final de palabra).
    const otherSideOk = (side: string | undefined) => side === undefined || side === ' ' || isNumCtx(side);
    if ((prevIsDigit && otherSideOk(next)) || (nextIsDigit && otherSideOk(prev))) {
      // Evita convertir la "l" de unidades como "1 lpm" o palabras.
      if ((c === 'l' || c === 'I') && next !== undefined && /[a-z]/i.test(next)) continue;
      if ((c === 'o' || c === 'O') && next !== undefined && /[a-z]/i.test(next)) continue;
      chars[i] = c === 'o' || c === 'O' ? '0' : '1';
    }
  }
  return chars.join('').replace(/\bk[rn]n\b/g, 'km').replace(/\bkrn\//g, 'km/');
}

export interface ParsedNumber {
  value: number;
  ambiguous: boolean;
}

/**
 * "8,42" → 8.42 · "8.42" → 8.42 · "1.234,5" → 1234.5 · "1,234.5" → 1234.5
 * Con un único separador seguido de exactamente 3 cifras:
 *   - si se esperan enteros (metros, calorías) → separador de miles;
 *   - si no → decimal, pero marcado como ambiguo.
 */
export function parseLocaleNumber(raw: string, expectInteger = false): ParsedNumber | null {
  const s = raw.replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s)) return null;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;

  if (dots === 0 && commas === 0) return { value: Number(s), ambiguous: false };

  if (dots > 0 && commas > 0) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    const value = Number(s.split(thousandsSep).join('').replace(decimalSep, '.'));
    return Number.isFinite(value) ? { value, ambiguous: false } : null;
  }

  const sep = dots > 0 ? '.' : ',';
  const count = dots + commas;
  const parts = s.split(sep);
  if (count > 1) {
    // Varios separadores iguales: solo pueden ser de miles.
    if (parts.slice(1).every((p) => p.length === 3)) return { value: Number(parts.join('')), ambiguous: false };
    return null;
  }
  const decimals = parts[1]!;
  if (decimals.length === 3) {
    if (expectInteger) return { value: Number(parts.join('')), ambiguous: false };
    return { value: Number(`${parts[0]}.${decimals}`), ambiguous: true };
  }
  return { value: Number(`${parts[0]}.${decimals}`), ambiguous: false };
}

const UNIT_MAP: Record<string, DistanceUnit> = {
  km: 'km',
  kms: 'km',
  kilometros: 'km',
  kilometers: 'km',
  kilometres: 'km',
  m: 'm',
  mts: 'm',
  metros: 'm',
  meters: 'm',
  metres: 'm',
  mi: 'mi',
  millas: 'mi',
  miles: 'mi',
};

export function distanceToKm(value: number, unit: DistanceUnit): number {
  return unit === 'km' ? value : unit === 'm' ? value / 1000 : value * 1.609344;
}

interface Rule {
  kind: TokenKind;
  re: RegExp;
  build(m: RegExpExecArray): Omit<Token, 'kind' | 'start' | 'end' | 'raw'> | null;
}

const NUM = String.raw`\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?`;

const RULES: Rule[] = [
  {
    // Hora del día: "a las 7:30", "at 7:30 am"
    kind: 'timeOfDay',
    re: /\b(?:a las|at)\s+(\d{1,2}):(\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/g,
    build(m) {
      let h = Number(m[1]);
      const min = Number(m[2]);
      const ampm = m[3]?.replace(/[\s.]/g, '');
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      if (h > 23 || min > 59) return null;
      return { value: h * 60 + min, text: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` };
    },
  },
  {
    // Ritmo: 5:46 /km · 5'46"/km · 5:46 min/km · 2:05 /500m
    kind: 'pace',
    re: /(\d{1,2})\s*[:'.]\s*([0-5]\d)\s*(?:"|'')?\s*(?:min)?\s*\/\s*(km|k|mi|500\s?m)\b/g,
    build(m) {
      const s = Number(m[1]) * 60 + Number(m[2]);
      if (s <= 0) return null;
      const unit = m[3]!.replace(/\s/g, '');
      const perKm = unit === 'mi' ? s / 1.609344 : unit === '500m' ? s * 2 : s;
      return { value: perKm };
    },
  },
  {
    kind: 'speed',
    re: new RegExp(String.raw`(${NUM})\s*(km\s?\/\s?h|kmh|kph|mph)\b`, 'g'),
    build(m) {
      const n = parseLocaleNumber(m[1]!);
      if (!n) return null;
      return { value: m[2] === 'mph' ? n.value * 1.609344 : n.value, ambiguous: n.ambiguous };
    },
  },
  {
    kind: 'duration',
    re: /\b(\d{1,2}):([0-5]\d):([0-5]\d)\b/g,
    build(m) {
      return { value: Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) };
    },
  },
  {
    // 1 h 05 min · 1h 5m 20s
    kind: 'duration',
    re: /\b(\d{1,2})\s*h\s*(\d{1,2})\s*(?:min|m)\b(?:\s*(\d{1,2})\s*s\b)?/g,
    build(m) {
      return { value: Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) };
    },
  },
  {
    // 48 min 35 s · 48m 35s
    kind: 'duration',
    re: /\b(\d{1,3})\s*(?:min|m)\s*(\d{1,2})\s*s\b/g,
    build(m) {
      return { value: Number(m[1]) * 60 + Number(m[2]) };
    },
  },
  {
    // 45 min (solo minutos)
    kind: 'duration',
    re: /\b(\d{1,3})\s*min\b(?!\s*\/)/g,
    build(m) {
      return { value: Number(m[1]) * 60 };
    },
  },
  {
    // mm:ss (o h:mm): ambiguo hasta conocer la etiqueta
    kind: 'clock',
    re: /\b(\d{1,3}):([0-5]\d)\b/g,
    build(m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      return { value: a * 60 + b, altValue: a <= 23 ? a * 3600 + b * 60 : undefined };
    },
  },
  {
    kind: 'distance',
    re: new RegExp(String.raw`(${NUM})\s*(kilometros|kilometers|kilometres|kms|km|millas|miles|mi|metros|meters|metres|mts|m)\b(?!\s*\/)`, 'g'),
    build(m) {
      const unit = UNIT_MAP[m[2]!];
      if (!unit) return null;
      const n = parseLocaleNumber(m[1]!, unit === 'm');
      if (!n) return null;
      return { value: n.value, unit, ambiguous: n.ambiguous };
    },
  },
  {
    kind: 'calories',
    re: new RegExp(String.raw`(${NUM})\s*(kcal|cal|calorias|calories|kilocalorias|kilocalories)\b`, 'g'),
    build(m) {
      const n = parseLocaleNumber(m[1]!, true);
      if (!n || !Number.isInteger(n.value)) return null;
      return { value: n.value };
    },
  },
  {
    kind: 'watts',
    re: /(\d{1,4})\s*(w|watts|vatios)\b/g,
    build(m) {
      return { value: Number(m[1]) };
    },
  },
  {
    kind: 'number',
    re: new RegExp(String.raw`(${NUM})`, 'g'),
    build(m) {
      const n = parseLocaleNumber(m[1]!);
      if (!n) return null;
      return { value: n.value, ambiguous: n.ambiguous };
    },
  },
];

/**
 * Extrae tokens de una línea ya normalizada. Las reglas se aplican por orden de
 * especificidad y cada carácter solo puede pertenecer a un token.
 */
export function extractTokens(line: string): Token[] {
  const taken = new Array<boolean>(line.length).fill(false);
  const tokens: Token[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(line)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (m[0].length === 0) {
        rule.re.lastIndex++;
        continue;
      }
      let overlap = false;
      for (let i = start; i < end; i++) {
        if (taken[i]) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;
      // Evita capturar cifras pegadas a letras (p. ej. "x2", "a1b").
      const before = line[start - 1];
      if (before !== undefined && /[a-z0-9]/.test(before) && rule.kind !== 'timeOfDay') continue;
      const built = rule.build(m);
      if (!built) continue;
      for (let i = start; i < end; i++) taken[i] = true;
      tokens.push({ kind: rule.kind, start, end, raw: m[0].trim(), ...built });
    }
  }
  return tokens.sort((a, b) => a.start - b.start);
}

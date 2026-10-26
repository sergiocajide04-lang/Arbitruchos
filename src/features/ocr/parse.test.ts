import { describe, expect, it } from 'vitest';
import { extractTokens, fixNumericConfusions, normalizeText, parseLocaleNumber } from './numbers';
import { parseOcrLines } from './parse';
import type { OcrLine } from './types';

const TODAY = '2026-10-25';

const lines = (text: string, confidence = 92): OcrLine[] =>
  text
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ text: t, confidence }));

describe('números y unidades', () => {
  it('acepta coma y punto decimales', () => {
    expect(parseLocaleNumber('8,42')).toEqual({ value: 8.42, ambiguous: false });
    expect(parseLocaleNumber('8.42')).toEqual({ value: 8.42, ambiguous: false });
    expect(parseLocaleNumber('1.234,5')!.value).toBe(1234.5);
    expect(parseLocaleNumber('1,234.5')!.value).toBe(1234.5);
  });

  it('trata los separadores de 3 cifras según el contexto', () => {
    expect(parseLocaleNumber('1.234', true)).toEqual({ value: 1234, ambiguous: false });
    expect(parseLocaleNumber('1.234')).toEqual({ value: 1.234, ambiguous: true });
  });

  it('extrae distancias en km y metros', () => {
    const [km] = extractTokens('8,42 km');
    expect(km).toMatchObject({ kind: 'distance', value: 8.42, unit: 'km' });
    const [m] = extractTokens('301 m');
    expect(m).toMatchObject({ kind: 'distance', value: 301, unit: 'm' });
    const [mi] = extractTokens('3.1 mi');
    expect(mi).toMatchObject({ kind: 'distance', unit: 'mi' });
  });

  it('extrae duraciones en distintos formatos', () => {
    expect(extractTokens('00:29:28')[0]).toMatchObject({ kind: 'duration', value: 1768 });
    expect(extractTokens('48:35')[0]).toMatchObject({ kind: 'clock', value: 2915 });
    expect(extractTokens('1h 05m')[0]).toMatchObject({ kind: 'duration', value: 3900 });
    expect(extractTokens('48m 35s')[0]).toMatchObject({ kind: 'duration', value: 2915 });
  });

  it('extrae ritmos y velocidades', () => {
    expect(extractTokens('5:46 min/km')[0]).toMatchObject({ kind: 'pace', value: 346 });
    expect(extractTokens('5:46 /km')[0]).toMatchObject({ kind: 'pace', value: 346 });
    expect(extractTokens(`5'46"/km`)[0]).toMatchObject({ kind: 'pace', value: 346 });
    expect(extractTokens('10.4 km/h')[0]).toMatchObject({ kind: 'speed', value: 10.4 });
    expect(extractTokens('2:05 /500m')[0]).toMatchObject({ kind: 'pace', value: 250 });
  });

  it('corrige confusiones típicas del OCR solo en contexto numérico', () => {
    expect(fixNumericConfusions('8,4O km')).toBe('8,40 km');
    expect(fixNumericConfusions('l2,5 km')).toBe('12,5 km');
    expect(fixNumericConfusions('8,42 krn')).toBe('8,42 km');
    expect(fixNumericConfusions('hola mundo')).toBe('hola mundo');
    expect(normalizeText('Calorías Activas')).toBe('calorias activas');
  });
});

describe('Strava', () => {
  it('reconoce una actividad en español con etiquetas y valores en la misma línea', () => {
    const r = parseOcrLines(
      lines(`
        9:41
        Carrera de la mañana
        20 de octubre de 2026 a las 7:30
        Distancia 8,42 km
        Ritmo medio 5:46 /km
        Tiempo en movimiento 48:35
        Desnivel positivo 45 m
        Calorías 612 Cal
        STRAVA
      `),
      TODAY,
    );
    expect(r.source.value).toBe('strava');
    expect(r.activityType.value).toBe('run');
    expect(r.distance.value).toMatchObject({ value: 8.42, unit: 'km', km: 8.42 });
    expect(r.distance.status).toBe('ok');
    expect(r.durationS.value).toBe(2915);
    expect(r.paceS.value).toBe(346);
    expect(r.calories.value).toBe(612);
    expect(r.date.value).toBe('2026-10-20');
    expect(r.time.value).toBe('07:30');
    expect(r.warnings).toEqual([]);
  });

  it('reconoce el diseño en cuadrícula (etiquetas encima de los valores)', () => {
    const r = parseOcrLines(
      lines(`
        Morning Run
        October 20, 2026 at 7:30 AM
        Distance          Pace              Time
        8.42 km           5:46 /km          48:35
        Elevation Gain    Calories
        45 m              612 Cal
        Strava
      `),
      TODAY,
    );
    expect(r.distance.value?.km).toBe(8.42);
    expect(r.paceS.value).toBe(346);
    expect(r.durationS.value).toBe(2915);
    expect(r.calories.value).toBe(612);
    expect(r.date.value).toBe('2026-10-20');
  });

  it('elige el tiempo en movimiento coherente con el ritmo frente al transcurrido', () => {
    const r = parseOcrLines(
      lines(`
        Distancia 10,00 km
        Ritmo medio 5:00 /km
        Tiempo transcurrido 55:10
        Tiempo en movimiento 50:00
        Strava
      `),
      TODAY,
    );
    expect(r.durationS.value).toBe(3000);
  });
});

describe('Apple Fitness', () => {
  it('distingue calorías activas y totales', () => {
    const r = parseOcrLines(
      lines(`
        Carrera al aire libre
        Tiempo de entrenamiento
        0:48:35
        Distancia
        8,42KM
        Calorías activas
        512KCAL
        Calorías totales
        598KCAL
        Ritmo medio
        5'46"/KM
        Frecuencia cardiaca media
        152LPM
      `),
      TODAY,
    );
    expect(r.source.value).toBe('apple');
    expect(r.activityType.value).toBe('run');
    expect(r.durationS.value).toBe(2915);
    expect(r.distance.value?.km).toBe(8.42);
    expect(r.paceS.value).toBe(346);
    expect(r.calories.value).toBe(512);
    expect(r.caloriesKind).toBe('active');
    expect(r.caloriesTotal).toBe(598);
  });

  it('reconoce la versión en inglés', () => {
    const r = parseOcrLines(
      lines(`
        Outdoor Run
        Workout Time      Distance
        0:29:28           5.12KM
        Active Kilocalories   Total Kilocalories
        301KCAL           355KCAL
        Avg. Pace
        5'45"/KM
      `),
      TODAY,
    );
    expect(r.durationS.value).toBe(1768);
    expect(r.distance.value?.km).toBe(5.12);
    expect(r.calories.value).toBe(301);
    expect(r.caloriesKind).toBe('active');
    expect(r.paceS.value).toBe(345);
  });

  it('no confunde el desnivel con la distancia', () => {
    const r = parseOcrLines(
      lines(`
        Elevation Gain
        45M
        Distance
        6,01KM
      `),
      TODAY,
    );
    expect(r.distance.value?.km).toBe(6.01);
  });
});

describe('consolas de gimnasio', () => {
  it('lee la consola de Assault Fitness con etiquetas en mayúsculas', () => {
    const r = parseOcrLines(
      lines(`
        ASSAULTRUNNER
        TIME        CALORIES
        29:28       301
        DISTANCE    SPEED
        4.85 KM     10.4 KM/H
        WATTS       PACE
        150         6:05 /KM
      `),
      TODAY,
    );
    expect(r.source.value).toBe('gym_console');
    expect(r.activityType.value).toBe('treadmill');
    expect(r.durationS.value).toBe(1768);
    expect(r.calories.value).toBe(301);
    expect(r.caloriesKind).toBe('unknown');
    expect(r.distance.value?.km).toBe(4.85);
    expect(r.speedKmh.value).toBe(10.4);
    expect(r.watts.value).toBe(150);
    expect(r.paceS.value).toBe(365);
  });

  it('normaliza distancias en metros', () => {
    const r = parseOcrLines(
      lines(`
        TIME 02:10
        DISTANCE 301 m
      `),
      TODAY,
    );
    expect(r.distance.value).toMatchObject({ value: 301, unit: 'm', km: 0.301 });
    expect(r.durationS.value).toBe(130);
  });

  it('marca como dudosa una distancia sin unidad visible', () => {
    const r = parseOcrLines(lines(`DISTANCE\n3.01`), TODAY);
    expect(r.distance.value?.km).toBe(3.01);
    expect(r.distance.status).toBe('uncertain');
    expect(r.distance.note).toMatch(/unidad/);
  });

  it('muestra para revisión un campo a cero', () => {
    const r = parseOcrLines(lines(`TIME 10:00\nDISTANCE 0.00 KM`), TODAY);
    expect(r.distance.value?.km).toBe(0);
    expect(r.distance.status).toBe('uncertain');
  });
});

describe('casos difíciles', () => {
  it('deja vacíos los campos ausentes, sin inventar valores', () => {
    const r = parseOcrLines(lines(`Distancia 7,5 km`), TODAY);
    expect(r.distance.value?.km).toBe(7.5);
    expect(r.durationS).toMatchObject({ value: null, status: 'missing' });
    expect(r.paceS).toMatchObject({ value: null, status: 'missing' });
    expect(r.calories.value).toBeNull();
    expect(r.date.value).toBeNull();
  });

  it('calcula el ritmo si falta, marcándolo como derivado', () => {
    const r = parseOcrLines(lines(`Distance 10 km\nTime 50:00`), TODAY);
    expect(r.paceS).toMatchObject({ value: 300, status: 'derived' });
  });

  it('señala datos incoherentes', () => {
    const r = parseOcrLines(lines(`Distancia 8,42 km\nRitmo 4:00 /km\nTiempo 48:35`), TODAY);
    expect(r.distance.status).toBe('uncertain');
    expect(r.paceS.status).toBe('uncertain');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('marca el separador decimal ambiguo', () => {
    const r = parseOcrLines(lines(`Distancia 1.234 km`), TODAY);
    expect(r.distance.status).toBe('uncertain');
  });

  it('no toma la hora de la barra de estado como duración', () => {
    const r = parseOcrLines(lines(`9:41\nDistancia 5,00 km`), TODAY);
    expect(r.durationS.value).toBeNull();
  });

  it('una lectura borrosa (baja confianza) deja los campos como dudosos', () => {
    const r = parseOcrLines(lines(`Distancia 8,42 km\nTiempo 48:35`, 35), TODAY);
    expect(r.distance.status).toBe('uncertain');
    expect(r.warnings.join(' ')).toMatch(/poca confianza/);
  });

  it('sin texto reconocible devuelve un aviso', () => {
    const r = parseOcrLines([], TODAY);
    expect(r.lineCount).toBe(0);
    expect(r.warnings[0]).toMatch(/No se ha reconocido texto/);
  });

  it('una fecha sin año no queda en el futuro', () => {
    const r = parseOcrLines(lines(`28 de diciembre\nDistancia 5 km`), TODAY);
    expect(r.date.value).toBe('2025-12-28');
    expect(r.date.status).toBe('uncertain');
  });
});

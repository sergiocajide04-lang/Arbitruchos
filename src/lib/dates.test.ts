import { describe, expect, it } from 'vitest';
import {
  addDays,
  defaultComplianceWeek,
  formatWeekRange,
  isIsoDate,
  isoWeekNumber,
  seasonWeekIndex,
  todayInTimeZone,
  weekStartOf,
  weeksInRange,
} from './dates';
import { formatDuration, formatPace, formatPct, initials } from './format';

describe('fechas', () => {
  it('la semana empieza en lunes', () => {
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19'); // domingo
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19'); // lunes
    expect(weekStartOf('2026-10-24')).toBe('2026-10-19'); // sábado
  });

  it('un partido de fin de semana asigna el objetivo a la semana siguiente', () => {
    expect(defaultComplianceWeek('2026-10-24')).toBe('2026-10-26'); // sábado
    expect(defaultComplianceWeek('2026-10-25')).toBe('2026-10-26'); // domingo
  });

  it('usa la zona horaria del grupo para saber qué día es hoy', () => {
    const instant = new Date('2026-10-25T23:30:00Z');
    expect(todayInTimeZone('Europe/Madrid', instant)).toBe('2026-10-26');
    expect(todayInTimeZone('America/New_York', instant)).toBe('2026-10-25');
  });

  it('aritmética de fechas independiente del horario de verano', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });

  it('valida fechas ISO', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('26-10-2026')).toBe(false);
  });

  it('calcula semanas', () => {
    expect(isoWeekNumber('2026-10-26')).toBe(44);
    expect(weeksInRange('2026-10-21', '2026-11-03')).toEqual(['2026-10-19', '2026-10-26', '2026-11-02']);
    expect(seasonWeekIndex('2026-09-01', '2026-09-07')).toBe(2);
    expect(formatWeekRange('2026-10-26')).toBe('26 oct – 1 nov');
  });
});

describe('formatos', () => {
  it('formatea ritmos, duraciones y porcentajes', () => {
    expect(formatPace(346)).toBe('5:46');
    expect(formatPace(null)).toBe('—');
    expect(formatDuration(1768)).toBe('29:28');
    expect(formatDuration(3730)).toBe('1:02:10');
    expect(formatPct(null)).toBe('Sin objetivo');
    expect(formatPct(99.7)).toBe('99 %');
    expect(formatPct(125)).toBe('125 %');
    expect(initials('Marta López Gil')).toBe('MG');
  });
});

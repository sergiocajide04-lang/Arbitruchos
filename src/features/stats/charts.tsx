/**
 * Gráficos (Recharts). Convenciones:
 *  - Una sola serie de color (lima de marca) por gráfico; el objetivo se dibuja
 *    como referencia neutra y discontinua, así la identidad no depende del color.
 *  - Un único eje Y por gráfico. Rejilla y ejes discretos.
 *  - Tooltip en hover/toque y tabla alternativa accesible en cada tarjeta.
 *  - Los colores se leen de los tokens CSS del tema activo.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { Card, CardHeader } from '@/components/ui/card';
import { formatDayMonth, formatMonthYear, formatWeekRange } from '@/lib/dates';
import { formatKm, formatPace, formatPct } from '@/lib/format';
import type { MonthPoint, WeekPoint } from './series';

function readToken(name: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim();
  return v ? `rgb(${v.split(/\s+/).join(',')})` : '#888';
}

function useChartColors() {
  const read = () => ({
    accent: readToken('accent'),
    muted: readToken('muted'),
    grid: readToken('border'),
    surface: readToken('surface'),
    fg: readToken('fg'),
  });
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return colors;
}

const axisProps = (color: string) => ({
  tick: { fill: color, fontSize: 11 },
  tickLine: false,
  axisLine: false,
});

function ChartTooltip({
  active,
  payload,
  label,
  format,
  labelFormat = (l) => `Semana ${formatWeekRange(String(l))}`,
}: TooltipProps<number, string> & {
  format: (name: string, value: number | null) => string;
  labelFormat?: (label: unknown) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-fg">{labelFormat(label)}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-muted">
          <span aria-hidden className="inline-block h-0.5 w-3 rounded" style={{ background: p.color }} />
          <span className="text-fg">{format(String(p.name), (p.value as number | null) ?? null)}</span>
        </p>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  description,
  empty,
  children,
  table,
}: {
  title: string;
  description?: string;
  empty?: string | null;
  children: ReactNode;
  table: ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} as="h3" />
      {description && <p className="px-4 pt-1 text-xs text-muted sm:px-5">{description}</p>}
      <div className="p-2 pt-4 sm:p-4">
        {empty ? (
          <p className="grid h-48 place-items-center rounded-xl border border-dashed border-border px-6 text-center text-sm text-muted">{empty}</p>
        ) : (
          <div className="h-56 w-full sm:h-64" role="img" aria-label={`${title}. Consulta la tabla de datos para los valores.`}>
            {children}
          </div>
        )}
      </div>
      {!empty && (
        <details className="border-t border-border/60 px-4 py-3 text-sm sm:px-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer list-none text-xs font-semibold text-accent-text">Ver datos en tabla</summary>
          <div className="mt-3 max-h-64 overflow-auto">{table}</div>
        </details>
      )}
    </Card>
  );
}

function WeekTable({ rows, cols }: { rows: WeekPoint[]; cols: Array<{ label: string; value: (r: WeekPoint) => string }> }) {
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-muted">
        <tr>
          <th className="py-1 pr-2 font-medium">Semana</th>
          {cols.map((c) => (
            <th key={c.label} className="py-1 pr-2 text-right font-medium">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.weekStart} className="border-t border-border/40">
            <td className="py-1 pr-2">{formatWeekRange(r.weekStart)}</td>
            {cols.map((c) => (
              <td key={c.label} className="num py-1 pr-2 text-right">
                {c.value(r)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const weekTick = (v: string) => formatDayMonth(v);

// 1 · Kilómetros por semana -------------------------------------------------
export function KmPerWeekChart({ data }: { data: WeekPoint[] }) {
  const c = useChartColors();
  return (
    <ChartCard
      title="Kilómetros por semana"
      description="Kilómetros computables corridos cada semana."
      empty={data.every((d) => d.km === 0) ? 'Aún no hay kilómetros en este periodo.' : null}
      table={<WeekTable rows={data} cols={[{ label: 'Km', value: (r) => formatKm(r.km, true) }]} />}
    >
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} strokeOpacity={0.5} />
          <XAxis dataKey="weekStart" tickFormatter={weekTick} {...axisProps(c.muted)} minTickGap={16} />
          <YAxis {...axisProps(c.muted)} allowDecimals={false} unit=" km" width={72} />
          <Tooltip cursor={{ fill: c.grid, fillOpacity: 0.3 }} content={<ChartTooltip format={(_, v) => `${formatKm(v ?? 0, true)} km`} />} />
          <Bar dataKey="km" name="Km" fill={c.accent} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// 2 · Kilómetros acumulados ---------------------------------------------------
export function CumulativeChart({ data }: { data: WeekPoint[] }) {
  const c = useChartColors();
  return (
    <ChartCard
      title="Kilómetros acumulados"
      description="Km corridos acumulados frente a la suma de objetivos (línea discontinua)."
      empty={data.every((d) => d.cumKm === 0 && d.cumTarget === 0) ? 'Sin datos acumulados todavía.' : null}
      table={
        <WeekTable
          rows={data}
          cols={[
            { label: 'Km acum.', value: (r) => formatKm(r.cumKm) },
            { label: 'Objetivo acum.', value: (r) => formatKm(r.cumTarget) },
          ]}
        />
      }
    >
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
          <defs>
            <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.accent} stopOpacity={0.35} />
              <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={c.grid} strokeOpacity={0.5} />
          <XAxis dataKey="weekStart" tickFormatter={weekTick} {...axisProps(c.muted)} minTickGap={16} />
          <YAxis {...axisProps(c.muted)} allowDecimals={false} unit=" km" width={72} />
          <Tooltip content={<ChartTooltip format={(n, v) => `${n}: ${formatKm(v ?? 0)} km`} />} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: c.muted }} />
          <Area type="monotone" dataKey="cumKm" name="Corridos" stroke={c.accent} strokeWidth={2} fill="url(#cumFill)" dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} />
          <Line type="stepAfter" dataKey="cumTarget" name="Objetivo" stroke={c.muted} strokeWidth={2} strokeDasharray="5 4" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// 3 · Ritmo medio por semana --------------------------------------------------
export function PaceChart({ data }: { data: WeekPoint[] }) {
  const c = useChartColors();
  const withPace = data.filter((d) => d.pace !== null);
  // Marcas redondas cada 15 o 30 s para leer el ritmo con facilidad.
  const paces = withPace.map((d) => d.pace!);
  const lo = paces.length ? Math.floor((Math.min(...paces) - 5) / 15) * 15 : 0;
  const hi = paces.length ? Math.ceil((Math.max(...paces) + 5) / 15) * 15 : 0;
  const step = hi - lo > 120 ? 30 : 15;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  return (
    <ChartCard
      title="Ritmo medio por semana"
      description="Tiempo total ÷ distancia total de los entrenos con duración (min/km). Más abajo = más rápido."
      empty={withPace.length === 0 ? 'Registra entrenamientos con duración para ver tu ritmo.' : null}
      table={<WeekTable rows={withPace} cols={[{ label: 'Ritmo', value: (r) => `${formatPace(r.pace)} /km` }]} />}
    >
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} strokeOpacity={0.5} />
          <XAxis dataKey="weekStart" tickFormatter={weekTick} {...axisProps(c.muted)} minTickGap={16} />
          <YAxis
            {...axisProps(c.muted)}
            reversed
            domain={[lo, hi]}
            ticks={ticks}
            interval={0}
            tickFormatter={(v: number) => formatPace(v)}
            width={50}
          />
          <Tooltip content={<ChartTooltip format={(_, v) => (v === null ? 'Sin datos' : `${formatPace(v)} /km`)} />} />
          <Line
            type="monotone"
            dataKey="pace"
            name="Ritmo"
            stroke={c.accent}
            strokeWidth={2}
            connectNulls
            dot={{ r: 4, fill: c.accent, stroke: c.surface, strokeWidth: 2 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// 4 · Cumplimiento semanal -----------------------------------------------------
export function CompliancePctChart({ data }: { data: WeekPoint[] }) {
  const c = useChartColors();
  const rows = data.filter((d) => d.pct !== null);
  return (
    <ChartCard
      title="Cumplimiento semanal"
      description="Porcentaje del objetivo de cada semana. La línea marca el 100 %."
      empty={rows.length === 0 ? 'Aún no hay semanas con objetivo.' : null}
      table={<WeekTable rows={rows} cols={[{ label: 'Cumplimiento', value: (r) => formatPct(r.pct) }]} />}
    >
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} strokeOpacity={0.5} />
          <XAxis dataKey="weekStart" tickFormatter={weekTick} {...axisProps(c.muted)} minTickGap={16} />
          <YAxis {...axisProps(c.muted)} unit=" %" width={58} allowDecimals={false} />
          <Tooltip cursor={{ fill: c.grid, fillOpacity: 0.3 }} content={<ChartTooltip format={(_, v) => formatPct(v)} />} />
          <ReferenceLine y={100} stroke={c.fg} strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: '100 %', fill: c.muted, fontSize: 11, position: 'insideTopRight' }} />
          <Bar dataKey="pct" name="Cumplimiento" fill={c.accent} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// 5 · Objetivo vs completados -------------------------------------------------
export function TargetVsCompletedChart({ data }: { data: WeekPoint[] }) {
  const c = useChartColors();
  const rows = data.filter((d) => d.target > 0 || d.km > 0);
  return (
    <ChartCard
      title="Objetivo frente a completados"
      description="Barras: km corridos. Línea discontinua: objetivo de la semana."
      empty={rows.length === 0 ? 'Sin objetivos ni kilómetros en este periodo.' : null}
      table={
        <WeekTable
          rows={rows}
          cols={[
            { label: 'Objetivo', value: (r) => `${formatKm(r.target)} km` },
            { label: 'Corridos', value: (r) => `${formatKm(r.km, true)} km` },
          ]}
        />
      }
    >
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} strokeOpacity={0.5} />
          <XAxis dataKey="weekStart" tickFormatter={weekTick} {...axisProps(c.muted)} minTickGap={16} />
          <YAxis {...axisProps(c.muted)} unit=" km" width={72} allowDecimals={false} />
          <Tooltip cursor={{ fill: c.grid, fillOpacity: 0.3 }} content={<ChartTooltip format={(n, v) => `${n}: ${formatKm(v ?? 0, true)} km`} />} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: c.muted }} />
          <Bar dataKey="km" name="Corridos" fill={c.accent} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Line type="step" dataKey="target" name="Objetivo" stroke={c.fg} strokeOpacity={0.7} strokeWidth={2} strokeDasharray="5 4" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// Evolución mensual ------------------------------------------------------------
export function MonthlyChart({ data }: { data: MonthPoint[] }) {
  const c = useChartColors();
  return (
    <ChartCard
      title="Kilómetros por mes"
      description="Kilómetros computables corridos cada mes."
      empty={data.length === 0 ? 'Sin entrenamientos todavía.' : null}
      table={
        <table className="w-full text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-medium">Mes</th>
              <th className="py-1 text-right font-medium">Km</th>
              <th className="py-1 text-right font-medium">Entrenos</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr key={m.month} className="border-t border-border/40">
                <td className="py-1">{formatMonthYear(`${m.month}-01`)}</td>
                <td className="num py-1 text-right">{formatKm(m.km, true)}</td>
                <td className="num py-1 text-right">{m.workouts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} strokeOpacity={0.5} />
          <XAxis dataKey="month" tickFormatter={(m: string) => formatMonthYear(`${m}-01`).slice(0, 3)} {...axisProps(c.muted)} />
          <YAxis {...axisProps(c.muted)} unit=" km" width={72} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: c.grid, fillOpacity: 0.3 }}
            content={<ChartTooltip format={(_, v) => `${formatKm(v ?? 0, true)} km`} labelFormat={(l) => formatMonthYear(`${String(l)}-01`)} />}
          />
          <Bar dataKey="km" name="Km" fill={c.accent} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// Ritmo medio por mes -----------------------------------------------------------
export function MonthlyPaceChart({ data }: { data: MonthPoint[] }) {
  const c = useChartColors();
  const rows = data.filter((d) => d.pace !== null);
  const paces = rows.map((d) => d.pace!);
  const lo = paces.length ? Math.floor((Math.min(...paces) - 5) / 15) * 15 : 0;
  const hi = paces.length ? Math.ceil((Math.max(...paces) + 5) / 15) * 15 : 0;
  const step = hi - lo > 120 ? 30 : 15;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  return (
    <ChartCard
      title="Ritmo medio por mes"
      description="Tiempo total ÷ distancia total de cada mes (min/km). Más arriba = más rápido."
      empty={rows.length === 0 ? 'Registra entrenamientos con duración para ver la evolución del ritmo.' : null}
      table={
        <table className="w-full text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-medium">Mes</th>
              <th className="py-1 text-right font-medium">Ritmo</th>
              <th className="py-1 text-right font-medium">Km</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.month} className="border-t border-border/40">
                <td className="py-1">{formatMonthYear(`${m.month}-01`)}</td>
                <td className="num py-1 text-right">{formatPace(m.pace)} /km</td>
                <td className="num py-1 text-right">{formatKm(m.km, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} strokeOpacity={0.5} />
          <XAxis dataKey="month" tickFormatter={(m: string) => formatMonthYear(`${m}-01`).slice(0, 3)} {...axisProps(c.muted)} />
          <YAxis {...axisProps(c.muted)} reversed domain={[lo, hi]} ticks={ticks} interval={0} tickFormatter={(v: number) => formatPace(v)} width={50} />
          <Tooltip
            content={
              <ChartTooltip
                format={(_, v) => (v === null ? 'Sin datos' : `${formatPace(v)} /km`)}
                labelFormat={(l) => formatMonthYear(`${String(l)}-01`)}
              />
            }
          />
          <Line type="monotone" dataKey="pace" name="Ritmo" stroke={c.accent} strokeWidth={2} dot={{ r: 4, fill: c.accent, stroke: c.surface, strokeWidth: 2 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

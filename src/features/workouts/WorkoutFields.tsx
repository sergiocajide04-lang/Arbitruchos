import { CheckCircle2, CircleDashed, HelpCircle, Sigma } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import { Badge } from '@/components/ui/misc';
import { Checkbox, Field, Input, Select } from '@/components/ui/field';
import { ACTIVITY_LABELS, SOURCE_LABELS, type ActivityType, type WorkoutSource } from '@/domain/types';
import type { FieldStatus, OcrField, ParsedWorkout } from '@/features/ocr/types';
import { paceWarning, type WorkoutFormValues } from './form';

type OcrKey = 'activityDate' | 'activityTime' | 'activityType' | 'source' | 'distance' | 'duration' | 'pace' | 'speed' | 'calories' | 'watts';

export function ocrFieldMap(r: ParsedWorkout): Record<OcrKey, OcrField<unknown>> {
  return {
    activityDate: r.date,
    activityTime: r.time,
    activityType: r.activityType,
    source: r.source,
    distance: r.distance,
    duration: r.durationS,
    pace: r.paceS,
    speed: r.speedKmh,
    calories: r.calories,
    watts: r.watts,
  };
}

const chip: Record<FieldStatus, { label: string; tone: 'success' | 'warning' | 'info' | 'neutral'; icon: typeof CheckCircle2 }> = {
  ok: { label: 'Detectado', tone: 'success', icon: CheckCircle2 },
  uncertain: { label: 'Revisar', tone: 'warning', icon: HelpCircle },
  derived: { label: 'Calculado', tone: 'info', icon: Sigma },
  missing: { label: 'No detectado', tone: 'neutral', icon: CircleDashed },
};

function StatusChip({ status }: { status: FieldStatus }) {
  const c = chip[status];
  return (
    <Badge tone={c.tone}>
      <c.icon className="size-3" aria-hidden />
      {c.label}
    </Badge>
  );
}

interface Props {
  form: UseFormReturn<WorkoutFormValues>;
  ocr?: ParsedWorkout | null;
  today: string;
  showConfirm: boolean;
}

export function WorkoutFields({ form, ocr, today, showConfirm }: Props) {
  const { errors } = form.formState;
  const map = ocr ? ocrFieldMap(ocr) : null;
  const values = useWatch({ control: form.control }) as WorkoutFormValues;
  const warn = paceWarning(values);

  const meta = (key: OcrKey) => {
    const f = map?.[key];
    if (!f) return {};
    return {
      trailing: <StatusChip status={f.status} />,
      warning: f.status === 'uncertain' || f.status === 'derived' || (f.status === 'missing' && f.note) ? f.note : undefined,
    };
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Distancia" error={errors.distance?.message} {...meta('distance')}>
          <Input inputMode="decimal" placeholder="8,42" autoComplete="off" className="num text-2xl font-bold" {...form.register('distance')} />
        </Field>
        <Field label="Unidad" hint="Se convierte siempre a kilómetros.">
          <Select {...form.register('distanceUnit')}>
            <option value="km">Kilómetros (km)</option>
            <option value="m">Metros (m)</option>
            <option value="mi">Millas (mi)</option>
          </Select>
        </Field>
        <Field label="Duración" optional hint="hh:mm:ss o mm:ss" error={errors.duration?.message} {...meta('duration')}>
          <Input inputMode="numeric" placeholder="48:35" autoComplete="off" className="num text-xl font-semibold" {...form.register('duration')} />
        </Field>
        <Field
          label="Ritmo medio"
          optional
          hint="min/km (m:ss). Si lo dejas vacío se calcula."
          error={errors.pace?.message}
          {...meta('pace')}
          warning={warn ?? meta('pace').warning}
        >
          <Input inputMode="numeric" placeholder="5:46" autoComplete="off" className="num text-xl font-semibold" {...form.register('pace')} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo de actividad" error={errors.activityType?.message} {...meta('activityType')}>
          <Select {...form.register('activityType')}>
            <option value="">Elige…</option>
            {(Object.keys(ACTIVITY_LABELS) as ActivityType[]).map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fuente" error={errors.source?.message} {...meta('source')}>
          <Select {...form.register('source')}>
            <option value="">Elige…</option>
            {(Object.keys(SOURCE_LABELS) as WorkoutSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha" error={errors.activityDate?.message} {...meta('activityDate')}>
          <Input type="date" max={today} {...form.register('activityDate')} />
        </Field>
        <Field label="Hora" optional error={errors.activityTime?.message} {...meta('activityTime')}>
          <Input type="time" {...form.register('activityTime')} />
        </Field>
      </div>

      <details className="rounded-xl border border-border/70 bg-surface-2/40 p-4 [&_summary::-webkit-details-marker]:hidden" open={!!ocr && (!!ocr.calories.value || !!ocr.speedKmh.value || !!ocr.watts.value)}>
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
          Velocidad, calorías y vatios <span className="text-xs text-muted">(opcional)</span>
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Velocidad media (km/h)" optional error={errors.speed?.message} {...meta('speed')}>
            <Input inputMode="decimal" placeholder="10,4" {...form.register('speed')} />
          </Field>
          <Field label="Vatios medios" optional error={errors.watts?.message} {...meta('watts')}>
            <Input inputMode="numeric" placeholder="150" {...form.register('watts')} />
          </Field>
          <Field label="Calorías" optional error={errors.calories?.message} {...meta('calories')}>
            <Input inputMode="numeric" placeholder="512" {...form.register('calories')} />
          </Field>
          <Field label="Tipo de calorías" optional hint="Las activas no incluyen el gasto basal.">
            <Select {...form.register('caloriesKind')}>
              <option value="">Sin especificar</option>
              <option value="active">Activas</option>
              <option value="total">Totales</option>
              <option value="unknown">Desconocido</option>
            </Select>
          </Field>
        </div>
      </details>

      {showConfirm && (
        <div className="rounded-xl border border-border bg-surface-2/50 p-4">
          <Checkbox
            label="He revisado los datos y son correctos"
            description="Se guardarán los valores tal y como aparecen arriba. La imagen no se guarda en ningún sitio."
            checked={!!values.confirmed}
            onChange={(c) => form.setValue('confirmed', c, { shouldValidate: form.formState.isSubmitted })}
          />
          {errors.confirmed?.message && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger">
              {errors.confirmed.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Camera, ImageOff, Loader2, PenLine, ScanText, ShieldCheck, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { ProgressBar } from '@/components/ui/misc';
import { ACTIVITY_LABELS, SOURCE_LABELS, type ActivityType } from '@/domain/types';
import { useUser } from '@/features/auth/AuthProvider';
import { useActiveGroup } from '@/features/group/GroupProvider';
import { assertSupportedFile, OcrError, recognizeWorkoutScreenshot, type OcrProgress, type ParsedWorkout } from '@/features/ocr';
import { useOnline } from '@/features/pwa/useOnline';
import { useFormDraft } from '@/hooks/useFormDraft';
import { useSeasonData } from '@/hooks/useSeasonData';
import { formatShortDate } from '@/lib/dates';
import { toUserMessage } from '@/lib/errors';
import { formatDuration, formatKm } from '@/lib/format';
import { PREF_KEYS } from '@/lib/storage';
import { uuid } from '@/lib/utils';
import { createWorkout, findSimilarWorkouts, type WorkoutInput } from '@/services/api';
import { emptyWorkoutForm, formFromOcr, toWorkoutInput, workoutFormSchema, type WorkoutFormValues } from './form';
import { WorkoutFields } from './WorkoutFields';

type Step = 'choose' | 'processing' | 'review';

const STAGE_LABEL: Record<OcrProgress['stage'], string> = {
  preparing: 'Preparando la imagen…',
  loading: 'Cargando el motor de reconocimiento…',
  recognizing: 'Leyendo los datos…',
  parsing: 'Interpretando los valores…',
};

export function NewWorkoutPage() {
  const [params] = useSearchParams();
  const manualFromUrl = params.get('modo') === 'manual';
  const [step, setStep] = useState<Step>(manualFromUrl ? 'review' : 'choose');
  const [manual, setManual] = useState(manualFromUrl);
  const [ocr, setOcr] = useState<ParsedWorkout | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  // La imagen SOLO vive en memoria mientras dura el proceso (URL de objeto local).
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const data = useSeasonData();

  const releaseImage = useCallback(() => {
    setPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // Al salir de la pantalla: cancela el OCR y libera la imagen.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      releaseImage();
    },
    [releaseImage],
  );

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrError(null);
    try {
      assertSupportedFile(file);
    } catch (err) {
      setOcrError(toUserMessage(err));
      e.target.value = '';
      return;
    }
    releaseImage();
    setPreviewUrl(URL.createObjectURL(file));
    setStep('processing');
    setProgress({ stage: 'preparing', progress: 0 });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await recognizeWorkoutScreenshot(file, { today: data.today, signal: controller.signal, onProgress: setProgress });
      setOcr(result);
      setManual(false);
      setStep('review');
    } catch (err) {
      if (err instanceof OcrError && err.code === 'cancelled') {
        setStep('choose');
        releaseImage();
        return;
      }
      setOcrError(toUserMessage(err, 'No se ha podido leer la imagen.'));
      setStep('choose');
      releaseImage();
    } finally {
      abortRef.current = null;
      setProgress(null);
      // El archivo no se conserva: solo queda la vista previa para comparar.
      e.target.value = '';
    }
  };

  const cancel = () => abortRef.current?.abort();

  return (
    <>
      <PageHeader
        title={manual ? 'Entrenamiento a mano' : 'Registrar entrenamiento'}
        subtitle={step === 'review' ? 'Revisa y corrige los datos antes de guardar.' : 'Sube la captura del resumen de tu actividad.'}
        back="/anadir"
      />

      {step === 'choose' && (
        <div className="space-y-4">
          {ocrError && (
            <p role="alert" className="flex gap-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              <ImageOff className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{ocrError}</span>
            </p>
          )}
          <label className="card group flex cursor-pointer flex-col items-center gap-4 border-dashed border-accent/40 p-8 text-center transition hover:border-accent hover:bg-surface-2/40 focus-within:ring-2 focus-within:ring-accent">
            <span className="grid size-16 place-items-center rounded-2xl bg-accent text-accent-fg shadow-glow">
              <Camera className="size-8" aria-hidden />
            </span>
            <span>
              <span className="block text-lg font-semibold">Elegir o hacer una captura</span>
              <span className="mt-1 block text-sm text-muted">Strava, Apple Fitness, consola de gimnasio u otra app (PNG o JPG)</span>
            </span>
            <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void onFile(e)} />
          </label>
          <Button variant="secondary" block onClick={() => { setManual(true); setOcr(null); setStep('review'); }}>
            <PenLine aria-hidden /> Introducir los datos a mano
          </Button>
          <p className="flex items-start gap-2 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden />
            La imagen se procesa en tu dispositivo y no se sube ni se guarda: solo se envían los valores que confirmes.
          </p>
        </div>
      )}

      {step === 'processing' && (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
            {previewUrl && (
              <img src={previewUrl} alt="Vista previa de la captura" className="h-40 w-auto rounded-xl border border-border object-contain" />
            )}
            <div className="w-full flex-1 space-y-3" aria-live="polite">
              <p className="flex items-center justify-center gap-2 font-semibold sm:justify-start">
                <Loader2 className="size-5 animate-spin text-accent-text" aria-hidden />
                {progress ? STAGE_LABEL[progress.stage] : 'Procesando…'}
              </p>
              <ProgressBar
                value={progress ? (progress.stage === 'recognizing' ? 30 + progress.progress * 70 : progress.progress * 30) : 0}
                label="Progreso del reconocimiento"
              />
              <p className="text-xs text-muted">La primera vez se descarga el motor (unos 6 MB); después queda en caché.</p>
              <Button variant="ghost" size="sm" onClick={cancel}>
                <X aria-hidden /> Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 'review' && (
        <ReviewStep
          ocr={manual ? null : ocr}
          previewUrl={manual ? null : previewUrl}
          onDiscard={() => {
            releaseImage();
            setOcr(null);
            setManual(false);
            setStep('choose');
          }}
          onSaved={releaseImage}
        />
      )}
    </>
  );
}

function ReviewStep({
  ocr,
  previewUrl,
  onDiscard,
  onSaved,
}: {
  ocr: ParsedWorkout | null;
  previewUrl: string | null;
  onDiscard(): void;
  onSaved(): void;
}) {
  const user = useUser();
  const { group, season } = useActiveGroup();
  const data = useSeasonData();
  const online = useOnline();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [requestId] = useState(uuid);
  const [duplicates, setDuplicates] = useState<Array<{ id: string; activity_date: string; distance_km: number; duration_s: number | null }> | null>(null);
  const [pendingInput, setPendingInput] = useState<WorkoutInput | null>(null);

  const initial = useMemo(() => (ocr ? formFromOcr(ocr, data.today) : emptyWorkoutForm(data.today)), [ocr, data.today]);
  const form = useForm<WorkoutFormValues>({
    resolver: zodResolver(workoutFormSchema({ today: data.today, requireConfirmation: true })) as unknown as Resolver<WorkoutFormValues>,
    defaultValues: initial,
  });
  const clearDraft = useFormDraft(PREF_KEYS.draftWorkout, form, { enabled: !ocr });
  const [activityDate, activityType] = useWatch({ control: form.control, name: ['activityDate', 'activityType'] });

  const outOfSeason = !!season && !!activityDate && (activityDate < season.start_date || activityDate > season.end_date);
  const notCounted = !!season && !!activityType && !season.counted_activity_types.includes(activityType as ActivityType);
  const needsReview = !ocr && !!season?.manual_requires_review;

  const save = useMutation({
    mutationFn: (input: WorkoutInput) => createWorkout(group.id, requestId, input),
    onSuccess: async (w) => {
      clearDraft();
      onSaved();
      await queryClient.invalidateQueries({ queryKey: ['workouts', group.id] });
      toast.success(
        w.validation_status === 'pending'
          ? `Guardado ${formatKm(w.distance_km, true)} km: pendiente de revisión por un administrador.`
          : `Entrenamiento guardado: ${formatKm(w.distance_km, true)} km.`,
      );
      navigate('/', { replace: true });
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });

  const submit = form.handleSubmit(async (v) => {
    const input = toWorkoutInput(v, { entryMethod: ocr ? 'ocr' : 'manual', ocr, initial: ocr ? initial : null });
    try {
      const similar = await findSimilarWorkouts(group.id, user.id, input.fingerprint);
      if (similar.length > 0) {
        setDuplicates(similar);
        setPendingInput(input);
        return;
      }
    } catch {
      // Si la comprobación falla, se continúa: la clave de idempotencia evita dobles envíos.
    }
    save.mutate(input);
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-5 lg:grid-cols-[minmax(0,320px)_1fr]">
      <aside className="space-y-4">
        {previewUrl ? (
          <details className="card overflow-hidden" open>
            <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <ScanText className="size-4 text-accent-text" aria-hidden /> Captura (solo en este dispositivo)
              </span>
            </summary>
            <img src={previewUrl} alt="Captura del entrenamiento para comparar" className="max-h-[60vh] w-full bg-bg object-contain" />
          </details>
        ) : (
          <Card className="p-4 text-sm text-muted">
            <p className="flex items-center gap-2 font-medium text-fg">
              <PenLine className="size-4 text-accent-text" aria-hidden /> Registro manual
            </p>
            <p className="mt-1">Quedará marcado como manual.{needsReview && ' En esta temporada, los registros manuales los revisa un administrador.'}</p>
          </Card>
        )}
        {ocr && ocr.warnings.length > 0 && (
          <div role="alert" className="space-y-1.5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            {ocr.warnings.map((w) => (
              <p key={w} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {w}
              </p>
            ))}
          </div>
        )}
        {ocr && (
          <p className="text-xs text-muted">
            El reconocimiento automático puede equivocarse. Comprueba especialmente los campos marcados como «Revisar».
          </p>
        )}
      </aside>

      <Card className="space-y-5 p-4 sm:p-6">
        <WorkoutFields form={form} ocr={ocr} today={data.today} showConfirm />

        {(outOfSeason || notCounted) && (
          <p role="status" className="flex gap-2 rounded-xl border border-info/40 bg-info/10 p-3 text-sm text-info">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {outOfSeason
              ? 'La fecha queda fuera de la temporada seleccionada: se guardará, pero no contará para sus objetivos.'
              : `En esta temporada, «${ACTIVITY_LABELS[activityType as ActivityType]}» no computa para el objetivo de kilómetros.`}
          </p>
        )}
        {!online && (
          <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
            Sin conexión: no se puede guardar ahora. {ocr ? 'No cierres esta pantalla.' : 'Tus datos se conservan en este dispositivo.'}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onDiscard}>
            Descartar
          </Button>
          <Button type="submit" size="lg" loading={save.isPending || form.formState.isSubmitting} disabled={!online}>
            Guardar entrenamiento
          </Button>
        </div>
      </Card>

      <Dialog
        open={!!duplicates}
        onOpenChange={(o) => !o && setDuplicates(null)}
        title="¿Entrenamiento repetido?"
        description="Ya tienes un registro con la misma fecha, distancia y duración."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDuplicates(null)}>
              Cancelar
            </Button>
            <Button
              loading={save.isPending}
              onClick={() => {
                setDuplicates(null);
                if (pendingInput) save.mutate(pendingInput);
              }}
            >
              Guardar igualmente
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-sm">
          {duplicates?.map((d) => (
            <li key={d.id} className="rounded-xl border border-border bg-surface-2/60 px-3 py-2">
              {formatShortDate(d.activity_date)} · <strong>{formatKm(Number(d.distance_km), true)} km</strong>
              {d.duration_s ? ` · ${formatDuration(d.duration_s)}` : ''}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Si son dos carreras distintas con los mismos datos, puedes guardarla. Fuente seleccionada:{' '}
          {pendingInput ? SOURCE_LABELS[pendingInput.source] : '—'}.
        </p>
      </Dialog>
    </form>
  );
}

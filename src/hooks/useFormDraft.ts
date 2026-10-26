import { useCallback, useEffect, useRef } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { readJsonPref, removePref, writeJsonPref, type PrefKey } from '@/lib/storage';

/**
 * Conserva temporalmente en el dispositivo un formulario sin enviar (p. ej. si se
 * pierde la conexión o se cierra la app). Solo valores de texto: nunca imágenes.
 * Se borra al guardar con éxito.
 */
export function useFormDraft<T extends FieldValues, TOut extends FieldValues = T>(
  key: PrefKey,
  form: UseFormReturn<T, unknown, TOut>,
  { enabled = true } = {},
) {
  const restored = useRef(false);

  useEffect(() => {
    if (!enabled || restored.current) return;
    restored.current = true;
    const draft = readJsonPref<Partial<T>>(key);
    if (draft && typeof draft === 'object') form.reset({ ...form.getValues(), ...draft });
  }, [enabled, form, key]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = form.watch((values) => {
      clearTimeout(timer);
      timer = setTimeout(() => writeJsonPref(key, values), 300);
    });
    return () => {
      clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [enabled, form, key]);

  return useCallback(() => removePref(key), [key]);
}

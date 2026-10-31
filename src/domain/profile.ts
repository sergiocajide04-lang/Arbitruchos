import { z } from 'zod';

/** Longitud máxima del nombre visible. La base de datos aplica el mismo límite. */
export const NAME_MAX = 20;

/** Caracteres reales (no unidades UTF-16), igual que char_length() en Postgres. */
export function nameLength(value: string): number {
  return [...value.trim()].length;
}

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Mínimo 2 caracteres')
  .refine((v) => nameLength(v) <= NAME_MAX, `Máximo ${NAME_MAX} caracteres`);

/** Mensaje de error del nombre, o null si es válido. */
export function displayNameError(value: string): string | null {
  const r = displayNameSchema.safeParse(value);
  return r.success ? null : (r.error.issues[0]?.message ?? 'Nombre no válido');
}

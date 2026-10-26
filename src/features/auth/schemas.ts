import { z } from 'zod';

export const emailSchema = z.string().trim().min(1, 'Introduce tu correo').email('El correo no es válido');

export const passwordSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(72, 'Máximo 72 caracteres')
  .regex(/[A-Za-z]/, 'Incluye al menos una letra')
  .regex(/\d/, 'Incluye al menos un número');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Introduce tu contraseña'),
});

export const inviteCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .refine((v) => v === '' || v.length === 10, 'El código tiene 10 caracteres (p. ej. ABCDE-12345)');

export const signupSchema = z.object({
  displayName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(40, 'Máximo 40 caracteres'),
  email: emailSchema,
  password: passwordSchema,
  inviteCode: inviteCodeSchema.optional(),
});

export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Las contraseñas no coinciden', path: ['confirm'] });

export function formatInviteCode(raw: string): string {
  const v = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  return v.length > 5 ? `${v.slice(0, 5)}-${v.slice(5)}` : v;
}

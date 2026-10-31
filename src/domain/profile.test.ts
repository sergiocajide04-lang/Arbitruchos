import { describe, expect, it } from 'vitest';
import { signupSchema } from '@/features/auth/schemas';
import { NAME_MAX, displayNameError, nameLength } from './profile';

describe('nombre visible (máximo 20 caracteres)', () => {
  it('admite un nombre de 20 caracteres', () => {
    const name = 'Cristian Fernández G'; // 20 caracteres con tilde
    expect(nameLength(name)).toBe(20);
    expect(displayNameError(name)).toBeNull();
  });

  it('rechaza un nombre de 21 caracteres sin recortarlo', () => {
    const name = 'Cristian Fernández Go';
    expect(nameLength(name)).toBe(21);
    expect(displayNameError(name)).toBe(`Máximo ${NAME_MAX} caracteres`);
  });

  it('cuenta caracteres reales, no unidades UTF-16, e ignora espacios de los extremos', () => {
    expect(nameLength('  Ana  ')).toBe(3);
    expect(nameLength('😀'.repeat(20))).toBe(20);
  });

  it('el registro aplica el mismo límite', () => {
    const base = { email: 'a@b.es', password: 'abcdefg1' };
    expect(signupSchema.safeParse({ ...base, displayName: 'Enrique Abelenda' }).success).toBe(true);
    const r = signupSchema.safeParse({ ...base, displayName: 'x'.repeat(21) });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toBe('Máximo 20 caracteres');
  });
});

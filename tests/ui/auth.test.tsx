import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute, state } from './mocks';

vi.mock('@/features/auth/AuthProvider', () => import('./mocks'));
vi.mock('@/features/group/GroupProvider', () => import('./mocks'));
vi.mock('@/services/api', () => ({ signIn: vi.fn(), signUp: vi.fn() }));

const api = await import('@/services/api');
const { LoginPage, SignupPage } = await import('@/features/auth/pages');
const { RequireAuth } = await import('@/features/auth/guards');

beforeEach(() => {
  state.status = 'signed_out';
  vi.mocked(api.signIn).mockReset();
});

describe('autenticación', () => {
  it('valida los campos antes de enviar', async () => {
    renderRoute(<LoginPage />, { path: '/acceso' });
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Introduce tu correo')).toBeInTheDocument();
    expect(screen.getByText('Introduce tu contraseña')).toBeInTheDocument();
    expect(api.signIn).not.toHaveBeenCalled();
  });

  it('inicia sesión y muestra errores comprensibles', async () => {
    vi.mocked(api.signIn).mockRejectedValueOnce({ message: 'Invalid login credentials' });
    renderRoute(<LoginPage />, { path: '/acceso' });
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'marta@example.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreta123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(api.signIn).toHaveBeenCalledWith('marta@example.test', 'secreta123');
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
  });

  it('el registro exige una contraseña robusta y conserva el código de invitación', async () => {
    renderRoute(<SignupPage />, { path: '/registro', at: '/registro?codigo=abcde12345' });
    expect(screen.getByLabelText(/Código de invitación/)).toHaveValue('ABCDE-12345');
    await userEvent.type(screen.getByLabelText('Nombre deportivo'), 'Marta');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'marta@example.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'corta');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByText('Mínimo 8 caracteres')).toBeInTheDocument();
  });

  it('las rutas privadas redirigen al acceso sin sesión', async () => {
    renderRoute(<RequireAuth />, { path: '/' });
    await waitFor(() => expect(screen.getByText('Otra ruta')).toBeInTheDocument());
  });
});

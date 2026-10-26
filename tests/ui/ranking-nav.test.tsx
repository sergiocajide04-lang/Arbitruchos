import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match, Workout } from '@/domain/types';
import { ANA, LUIS, ME, renderRoute, state } from './mocks';

vi.mock('@/features/auth/AuthProvider', () => import('./mocks'));
vi.mock('@/features/group/GroupProvider', () => import('./mocks'));
vi.mock('@/services/api', () => ({
  listMatches: vi.fn(),
  listWorkouts: vi.fn(),
  signOut: vi.fn(),
}));

const api = await import('@/services/api');
const { RankingPage } = await import('@/features/ranking/RankingPage');
const { DashboardPage } = await import('@/features/dashboard/DashboardPage');
const { AppShell } = await import('@/components/layout/AppShell');

const W = '2026-10-12';
const match = (referee: string, target: number): Match =>
  ({ id: `m-${referee}`, referee_id: referee, week_start: W, target_km: target, home_goals: target, away_goals: 0, created_at: '2026-10-11T10:00:00Z' }) as Match;
const workout = (user: string, km: number): Workout =>
  ({
    id: `w-${user}`,
    user_id: user,
    activity_date: '2026-10-14',
    week_start: W,
    distance_km: km,
    duration_s: null,
    activity_type: 'run',
    source: 'strava',
    validation_status: 'confirmed',
    entry_method: 'ocr',
    created_at: '2026-10-14T10:00:00Z',
    details: {},
  }) as unknown as Workout;

beforeEach(() => {
  state.status = 'signed_in';
  // Ana: 80/100 (80 %) · Luis: 45/50 (90 %) · Marta: sin objetivo
  vi.mocked(api.listMatches).mockResolvedValue([match(ANA, 100), match(LUIS, 50)]);
  vi.mocked(api.listWorkouts).mockResolvedValue([workout(ANA, 80), workout(LUIS, 45)]);
});

describe('clasificación', () => {
  it('ordena por cumplimiento relativo, no por distancia', async () => {
    renderRoute(<RankingPage />, { path: '/clasificacion' });
    const list = await screen.findByRole('list', { name: 'Clasificación del grupo' });
    const names = within(list).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(names[0]).toContain('Luis Gil');
    expect(names[0]).toContain('90 %');
    expect(names[1]).toContain('Ana Ruiz');
    expect(names[2]).toContain('Sin objetivo');
  });

  it('permite cambiar el criterio de orden', async () => {
    renderRoute(<RankingPage />, { path: '/clasificacion' });
    await screen.findByRole('list', { name: 'Clasificación del grupo' });
    await userEvent.selectOptions(screen.getByLabelText('Ordenar por'), 'km_desc');
    const items = within(screen.getByRole('list', { name: 'Clasificación del grupo' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Ana Ruiz');
    expect(localStorage.getItem('refrun_ranking_sort_v1')).toBe('km_desc');
  });
});

describe('inicio', () => {
  it('muestra estado vacío útil cuando no hay objetivo ni actividad', async () => {
    vi.mocked(api.listMatches).mockResolvedValue([]);
    vi.mocked(api.listWorkouts).mockResolvedValue([]);
    renderRoute(<DashboardPage />);
    expect((await screen.findAllByText('Sin objetivo')).length).toBeGreaterThan(0);
    expect(screen.getByText('Sin actividad todavía')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Registrar partido/ }).length).toBeGreaterThan(0);
  });

  it('muestra un error recuperable si falla la carga', async () => {
    vi.mocked(api.listMatches).mockRejectedValue({ message: 'Failed to fetch' });
    renderRoute(<DashboardPage />);
    expect(await screen.findByText(/No hay conexión con el servidor/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('sin temporada invita a crearla', async () => {
    state.season = null;
    renderRoute(<DashboardPage />);
    expect(await screen.findByText('No hay ninguna temporada')).toBeInTheDocument();
    const mocks = await import('./mocks');
    state.season = mocks.season;
  });
});

describe('navegación', () => {
  beforeEach(() => localStorage.setItem('refrun_install_prompt_dismissed_v1', '1'));

  it('la barra inferior tiene los cinco apartados accesibles', async () => {
    renderRoute(<AppShell />);
    const navs = screen.getAllByRole('navigation', { name: 'Navegación principal' });
    const bottom = navs.find((n) => n.tagName === 'NAV' && n.className.includes('bottom-0'))!;
    const labels = within(bottom).getAllByRole('link').map((a) => a.textContent);
    expect(labels).toEqual(['Inicio', 'Entrenos', 'Añadir', 'Clasificación', 'Perfil']);
    expect(screen.getByRole('button', { name: /Menú de usuario/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toBeInTheDocument();
  });

  it('avisa cuando no hay conexión', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderRoute(<AppShell />);
    expect(screen.getByText(/Sin conexión: puedes consultar/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('el menú de usuario ofrece las opciones secundarias y cerrar sesión', async () => {
    renderRoute(<AppShell />);
    await userEvent.click(screen.getByRole('button', { name: /Menú de usuario/ }));
    for (const label of ['Temporada', 'Historial', 'Miembros del grupo', 'Ajustes', 'Ayuda e instalación', 'Cerrar sesión']) {
      expect(await screen.findByRole('menuitem', { name: label })).toBeInTheDocument();
    }
  });

  it('no usa ME como si fuera otro miembro', () => {
    expect(ME).not.toBe(ANA);
  });
});

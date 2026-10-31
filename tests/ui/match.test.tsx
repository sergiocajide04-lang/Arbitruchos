import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, renderRoute, state } from './mocks';

vi.mock('@/features/auth/AuthProvider', () => import('./mocks'));
vi.mock('@/features/group/GroupProvider', () => import('./mocks'));
vi.mock('@/services/api', () => ({
  listMatches: vi.fn(async () => []),
  listWorkouts: vi.fn(async () => []),
  createMatch: vi.fn(),
}));

const api = await import('@/services/api');
const { NewMatchPage } = await import('@/features/matches/NewMatchPage');

beforeEach(() => {
  state.status = 'signed_in';
  state.isAdmin = false;
  vi.mocked(api.createMatch).mockReset();
});

describe('registro de partido', () => {
  it('previsualiza el resultado y el objetivo generado', async () => {
    renderRoute(<NewMatchPage />, { path: '/anadir/partido' });
    await userEvent.type(await screen.findByLabelText('Goles del primer equipo'), '13');
    await userEvent.type(screen.getByLabelText('Goles del segundo equipo'), '1');
    const preview = screen.getByText('Previsualización').parentElement!;
    expect(within(preview).getByText('Goles (13-1)')).toBeInTheDocument();
    expect(within(preview).getByText('14')).toBeInTheDocument();
    expect(within(preview).getByText('Marta López')).toBeInTheDocument();
  });

  it('las tarjetas suman al objetivo en tiempo real (13-1, 2 amarillas, 1 azul, 1 roja = 23 km)', async () => {
    renderRoute(<NewMatchPage />, { path: '/anadir/partido' });
    await userEvent.type(await screen.findByLabelText('Goles del primer equipo'), '13');
    await userEvent.type(screen.getByLabelText('Goles del segundo equipo'), '1');
    const preview = screen.getByText('Previsualización').parentElement!;
    await userEvent.click(screen.getByRole('button', { name: 'Una tarjeta amarilla más' }));
    await userEvent.click(screen.getByRole('button', { name: 'Una tarjeta amarilla más' }));
    expect(within(preview).getByText('16')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Una tarjeta azul más' }));
    const red = screen.getByLabelText('Rojas');
    await userEvent.clear(red);
    await userEvent.type(red, '1');
    expect(within(preview).getByText('23')).toBeInTheDocument();
    expect(within(preview).getByText('Tarjetas rojas').nextSibling).toHaveTextContent('5 km');
  });

  it('rechaza tarjetas negativas o vacías', async () => {
    renderRoute(<NewMatchPage />, { path: '/anadir/partido' });
    await userEvent.type(await screen.findByLabelText('Goles del primer equipo'), '3');
    await userEvent.type(screen.getByLabelText('Goles del segundo equipo'), '1');
    const yellow = screen.getByLabelText('Amarillas');
    await userEvent.clear(yellow);
    await userEvent.type(yellow, '-2');
    await userEvent.clear(screen.getByLabelText('Azules'));
    await userEvent.click(screen.getByRole('button', { name: /Revisar y guardar/ }));
    expect(await screen.findByText('Las tarjetas no pueden ser negativas')).toBeInTheDocument();
    expect(screen.getByText('Indica el número (0 si no hubo)')).toBeInTheDocument();
    expect(screen.queryByText('Confirmar partido')).not.toBeInTheDocument();
  });

  it('un campo vacío no se interpreta como cero', async () => {
    renderRoute(<NewMatchPage />, { path: '/anadir/partido' });
    await userEvent.type(await screen.findByLabelText('Goles del primer equipo'), '25');
    await userEvent.click(screen.getByRole('button', { name: /Revisar y guardar/ }));
    expect(await screen.findByText('Introduce los goles')).toBeInTheDocument();
    expect(screen.queryByText('Confirmar partido')).not.toBeInTheDocument();
  });

  it('rechaza goles negativos', async () => {
    renderRoute(<NewMatchPage />, { path: '/anadir/partido' });
    await userEvent.type(await screen.findByLabelText('Goles del primer equipo'), '-3');
    await userEvent.type(screen.getByLabelText('Goles del segundo equipo'), '1');
    await userEvent.click(screen.getByRole('button', { name: /Revisar y guardar/ }));
    expect(await screen.findByText('Los goles no pueden ser negativos')).toBeInTheDocument();
  });

  it('pide confirmación mostrando árbitro y semana, y guarda', async () => {
    vi.mocked(api.createMatch).mockResolvedValueOnce({ target_km: 11, week_start: '2026-10-19', match_date: '2026-10-24' } as never);
    renderRoute(<NewMatchPage />, { path: '/anadir/partido' });
    const date = await screen.findByLabelText('Fecha del partido');
    await userEvent.clear(date);
    await userEvent.type(date, '2026-10-24');
    await userEvent.type(screen.getByLabelText('Goles del primer equipo'), '4');
    await userEvent.type(screen.getByLabelText('Goles del segundo equipo'), '7');
    await userEvent.click(screen.getByRole('button', { name: /Revisar y guardar/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Objetivo generado').nextSibling).toHaveTextContent('11 km');
    expect(within(dialog).getByText('Marta López')).toBeInTheDocument();
    // Partido del sábado 24: el objetivo cuenta desde ese sábado a las 9:00.
    expect(within(dialog).getByText('sáb 24 oct – sáb 31 oct')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /Guardar partido/ }));

    await waitFor(() => expect(api.createMatch).toHaveBeenCalled());
    expect(vi.mocked(api.createMatch).mock.calls[0]![2]).toMatchObject({
      referee_id: ME,
      match_date: '2026-10-24',
      week_start: '2026-10-26',
      home_goals: 4,
      away_goals: 7,
      yellow_cards: 0,
      blue_cards: 0,
      red_cards: 0,
      home_team: null,
    });
    expect(await screen.findByText('Otra ruta')).toBeInTheDocument();
  });

  it('un miembro no puede elegir otro árbitro', async () => {
    renderRoute(<NewMatchPage />, { path: '/anadir/partido' });
    expect(await screen.findByLabelText('Árbitro al que se asigna el objetivo')).toBeDisabled();
  });
});

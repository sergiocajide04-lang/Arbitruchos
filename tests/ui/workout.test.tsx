import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseOcrLines } from '@/features/ocr/parse';
import { OcrError } from '@/features/ocr/types';
import type * as OcrModule from '@/features/ocr/index';
import { renderRoute, state } from './mocks';

vi.mock('@/features/auth/AuthProvider', () => import('./mocks'));
vi.mock('@/features/group/GroupProvider', () => import('./mocks'));
vi.mock('@/services/api', () => ({
  listMatches: vi.fn(async () => []),
  listWorkouts: vi.fn(async () => []),
  createWorkout: vi.fn(),
  findSimilarWorkouts: vi.fn(async () => []),
}));
vi.mock('@/features/ocr/index', async (orig) => ({
  ...(await orig<typeof OcrModule>()),
  recognizeWorkoutScreenshot: vi.fn(),
}));

const api = await import('@/services/api');
const ocr = await import('@/features/ocr/index');
const { NewWorkoutPage } = await import('@/features/workouts/NewWorkoutPage');

const file = () => new File([new Uint8Array([137, 80, 78, 71])], 'captura.png', { type: 'image/png' });

beforeEach(() => {
  state.status = 'signed_in';
  vi.mocked(api.createWorkout).mockReset();
  vi.mocked(api.findSimilarWorkouts).mockResolvedValue([]);
  vi.mocked(ocr.recognizeWorkoutScreenshot).mockReset();
});

async function uploadAndReview() {
  vi.mocked(ocr.recognizeWorkoutScreenshot).mockResolvedValueOnce(
    parseOcrLines(
      [
        { text: 'Carrera de la mañana', confidence: 90 },
        { text: '20 de octubre de 2026', confidence: 90 },
        { text: 'Distancia 8,42 km', confidence: 90 },
        { text: 'Tiempo en movimiento 48:35', confidence: 90 },
        { text: 'Strava', confidence: 90 },
      ],
      '2026-10-25',
    ),
  );
  renderRoute(<NewWorkoutPage />, { path: '/anadir/entrenamiento' });
  await userEvent.upload(await screen.findByLabelText(/Elegir o hacer una captura/), file());
  return screen.findByLabelText('Distancia');
}

describe('registro de entrenamiento con OCR', () => {
  it('muestra los datos detectados con su estado y exige confirmación expresa', async () => {
    const distance = await uploadAndReview();
    expect(distance).toHaveValue('8,42');
    expect(screen.getByLabelText(/Duración/)).toHaveValue('48:35');
    expect(screen.getAllByText('Detectado').length).toBeGreaterThan(0);
    expect(screen.getAllByText('No detectado').length).toBeGreaterThan(0);
    expect(screen.getByAltText(/Captura del entrenamiento/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
    expect(await screen.findByText('Confirma que has revisado los datos')).toBeInTheDocument();
    expect(api.createWorkout).not.toHaveBeenCalled();
  });

  it('guarda el valor corregido por el usuario, no el del OCR, y solo datos estructurados', async () => {
    vi.mocked(api.createWorkout).mockResolvedValueOnce({ distance_km: 8.24, validation_status: 'confirmed' } as never);
    const distance = await uploadAndReview();
    await userEvent.clear(distance);
    await userEvent.type(distance, '8,24');
    await userEvent.click(screen.getByLabelText('He revisado los datos y son correctos'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));

    await waitFor(() => expect(api.createWorkout).toHaveBeenCalled());
    const [, , input] = vi.mocked(api.createWorkout).mock.calls[0]!;
    expect(input).toMatchObject({
      distance_km: 8.24,
      duration_s: 2915,
      activity_date: '2026-10-20',
      source: 'strava',
      activity_type: 'run',
      entry_method: 'ocr',
    });
    expect(input.details.ocr?.edited_fields).toContain('distance');
    // Ningún campo contiene la imagen.
    expect(JSON.stringify(input)).not.toMatch(/blob:|data:image|captura\.png/);
  });

  it('avisa de un posible duplicado antes de guardar', async () => {
    vi.mocked(api.findSimilarWorkouts).mockResolvedValueOnce([
      { id: 'w0', activity_date: '2026-10-20', distance_km: 8.42, duration_s: 2915, source: 'strava', created_at: '' },
    ]);
    await uploadAndReview();
    await userEvent.click(screen.getByLabelText('He revisado los datos y son correctos'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar entrenamiento' }));
    expect(await screen.findByText('¿Entrenamiento repetido?')).toBeInTheDocument();
    expect(api.createWorkout).not.toHaveBeenCalled();
  });

  it('permite cancelar el reconocimiento', async () => {
    vi.mocked(ocr.recognizeWorkoutScreenshot).mockImplementationOnce(
      (_f, opts) =>
        new Promise((_, reject) => {
          opts.signal?.addEventListener('abort', () => reject(new OcrError('Proceso cancelado', 'cancelled')));
        }),
    );
    renderRoute(<NewWorkoutPage />, { path: '/anadir/entrenamiento' });
    await userEvent.upload(await screen.findByLabelText(/Elegir o hacer una captura/), file());
    await userEvent.click(await screen.findByRole('button', { name: /Cancelar/ }));
    expect(await screen.findByLabelText(/Elegir o hacer una captura/)).toBeInTheDocument();
  });

  it('si el OCR falla explica el problema y permite seguir a mano', async () => {
    vi.mocked(ocr.recognizeWorkoutScreenshot).mockRejectedValueOnce(new OcrError('No se ha encontrado texto en la imagen.', 'empty'));
    renderRoute(<NewWorkoutPage />, { path: '/anadir/entrenamiento' });
    await userEvent.upload(await screen.findByLabelText(/Elegir o hacer una captura/), file());
    expect(await screen.findByRole('alert')).toHaveTextContent('No se ha encontrado texto');
    await userEvent.click(screen.getByRole('button', { name: /Introducir los datos a mano/ }));
    expect(await screen.findByLabelText('Distancia')).toHaveValue('');
  });

  it('rechaza archivos que no son imágenes', async () => {
    renderRoute(<NewWorkoutPage />, { path: '/anadir/entrenamiento' });
    const input = await screen.findByLabelText(/Elegir o hacer una captura/);
    await userEvent.upload(input, new File(['%PDF'], 'informe.pdf', { type: 'application/pdf' }), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('Formato no compatible');
    expect(ocr.recognizeWorkoutScreenshot).not.toHaveBeenCalled();
  });

  it('sin conexión no permite guardar', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderRoute(<NewWorkoutPage />, { path: '/anadir/entrenamiento', at: '/anadir/entrenamiento?modo=manual' });
    expect(await screen.findByRole('button', { name: 'Guardar entrenamiento' })).toBeDisabled();
    expect(screen.getByText(/Sin conexión: no se puede guardar/)).toBeInTheDocument();
    spy.mockRestore();
  });
});

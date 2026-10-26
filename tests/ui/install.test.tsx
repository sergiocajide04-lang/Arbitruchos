import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InstallCard } from '@/features/pwa/InstallCard';
import { closeInstallPrompt, detectPlatform, INSTALL_SNOOZE_DAYS, shouldShowInstallPrompt } from '@/features/pwa/install';
import { PREF_KEYS } from '@/lib/storage';

describe('tarjeta de instalación', () => {
  it('se muestra con instrucciones para iPhone y Android', async () => {
    render(<InstallCard />);
    expect(await screen.findByText('Lleva REFRUN contigo')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'iPhone' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Android' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'iPhone' }));
    expect(screen.getByText(/Añadir a pantalla de inicio/)).toBeInTheDocument();
  });

  it('con "No volver a mostrar" marcado guarda la preferencia versionada y no reaparece', async () => {
    const { unmount } = render(<InstallCard />);
    await userEvent.click(await screen.findByLabelText('No volver a mostrar'));
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(localStorage.getItem('refrun_install_prompt_dismissed_v1')).toBe('1');
    expect(screen.queryByText('Lleva REFRUN contigo')).not.toBeInTheDocument();
    unmount();
    render(<InstallCard />);
    expect(screen.queryByText('Lleva REFRUN contigo')).not.toBeInTheDocument();
  });

  it('al cerrar sin marcar la casilla solo se aplaza unos días', async () => {
    render(<InstallCard />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar' }));
    expect(localStorage.getItem(PREF_KEYS.installDismissed)).toBeNull();
    expect(shouldShowInstallPrompt()).toBe(false);
    expect(shouldShowInstallPrompt(Date.now() + (INSTALL_SNOOZE_DAYS + 1) * 86_400_000)).toBe(true);
  });

  it('no se muestra si la app ya se ejecuta instalada', () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...original(q), matches: q.includes('standalone') })) as typeof window.matchMedia;
    expect(shouldShowInstallPrompt()).toBe(false);
    window.matchMedia = original;
  });

  it('tolera que el usuario borre los datos locales', () => {
    closeInstallPrompt(true);
    localStorage.clear();
    expect(shouldShowInstallPrompt()).toBe(true);
  });

  it('detecta iPhone, iPadOS y Android', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe('android');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe('desktop');
  });
});

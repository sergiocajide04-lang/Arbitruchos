/**
 * Detección de plataforma e instalación de la PWA.
 * - Chrome/Edge/Android: evento `beforeinstallprompt` (se captura lo antes posible).
 * - Safari iOS: no existe ese evento; solo se pueden mostrar instrucciones manuales.
 * Nunca se afirma que la app está instalada salvo que se esté ejecutando en modo standalone.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { PREF_KEYS, readPref, removePref, writePref } from '@/lib/storage';

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Llamar al arrancar la app (main.tsx), antes de que el navegador dispare el evento. */
export function captureInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function useDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => deferredPrompt,
    () => null,
  );
}

export async function triggerNativeInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const event = deferredPrompt;
  deferredPrompt = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(ua = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints ?? 0): Platform {
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  // iPadOS se identifica como Mac pero con pantalla táctil.
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

/** ¿Se está ejecutando como app instalada (pantalla de inicio)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true;
}

export function useIsStandalone(): boolean {
  const [standalone, setStandalone] = useState(isStandalone);
  useEffect(() => {
    const mq = window.matchMedia?.('(display-mode: standalone)');
    if (!mq) return;
    const onChange = () => setStandalone(isStandalone());
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return standalone;
}

// ---------------------------------------------------------------------------
// Preferencia "No volver a mostrar" y aplazamiento moderado
// ---------------------------------------------------------------------------
export const INSTALL_SNOOZE_DAYS = 3;

export function isInstallPromptDismissed(): boolean {
  return readPref(PREF_KEYS.installDismissed) === '1';
}

export function shouldShowInstallPrompt(now = Date.now()): boolean {
  if (isStandalone() || isInstallPromptDismissed()) return false;
  const until = Number(readPref(PREF_KEYS.installSnoozedUntil) ?? 0);
  return !(until > now);
}

/** Cierre de la tarjeta: con la casilla marcada no se vuelve a mostrar en este navegador. */
export function closeInstallPrompt(dontShowAgain: boolean, now = Date.now()) {
  if (dontShowAgain) {
    writePref(PREF_KEYS.installDismissed, '1');
  } else {
    writePref(PREF_KEYS.installSnoozedUntil, String(now + INSTALL_SNOOZE_DAYS * 86_400_000));
  }
}

export function resetInstallPromptPreference() {
  removePref(PREF_KEYS.installDismissed);
  removePref(PREF_KEYS.installSnoozedUntil);
}

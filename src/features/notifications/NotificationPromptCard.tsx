import { Bell, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PREF_KEYS, readPref, writePref } from '@/lib/storage';
import { EnablePushBlock, NOTIFICATIONS_INTRO } from './NotificationSettingsCard';
import { pushSupport, usePushState } from './push';

/**
 * Tarjeta discreta en Inicio. Solo aparece si el dispositivo admite Web Push y
 * el usuario aún no ha decidido; el permiso del navegador se pide únicamente al
 * pulsar «Activar notificaciones». «Ahora no» la oculta para siempre en este
 * dispositivo (se puede activar después desde Ajustes).
 */
export function NotificationPromptCard() {
  const { permission, subscribed } = usePushState();
  const [hidden, setHidden] = useState(() => readPref(PREF_KEYS.notificationsPromptDismissed) === '1');
  if (hidden || pushSupport() !== 'supported' || permission !== 'default' || subscribed !== false) return null;

  const dismiss = () => {
    writePref(PREF_KEYS.notificationsPromptDismissed, '1');
    setHidden(true);
  };

  return (
    <Card className="relative p-4 sm:p-5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar aviso de notificaciones"
        className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
      >
        <X className="size-4" aria-hidden />
      </button>
      <div className="flex gap-3 pr-8">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent/15">
          <Bell className="size-5 text-accent-text" aria-hidden />
        </span>
        <div className="min-w-0 space-y-3">
          <p className="text-sm">{NOTIFICATIONS_INTRO}</p>
          <div className="flex flex-wrap items-center gap-2">
            <EnablePushBlock onEnabled={() => setHidden(true)} />
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Ahora no
            </Button>
          </div>
          <p className="text-xs text-muted">
            Puedes cambiarlo cuando quieras en{' '}
            <Link to="/ajustes#notificaciones" className="font-semibold text-accent-text hover:underline">
              Ajustes → Notificaciones
            </Link>
            .
          </p>
        </div>
      </div>
    </Card>
  );
}

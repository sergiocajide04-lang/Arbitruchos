import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Select } from '@/components/ui/field';
import { ErrorBlock, LoadingBlock } from '@/components/ui/misc';
import { useUser } from '@/features/auth/AuthProvider';
import { useActiveGroup } from '@/features/group/GroupProvider';
import { toUserMessage } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import {
  deletePushDevice,
  getNotificationSettings,
  listMyDevices,
  listMyNotifications,
  saveNotificationSettings,
  type NotificationSettings,
} from '@/services/api';
import { currentSubscription, disablePush, enablePush, pushSupport, usePushState } from './push';

export const DAY_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo',
};
export const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
/** Horas permitidas (nunca de noche). La base de datos aplica el mismo rango. */
export const HOURS = Array.from({ length: 15 }, (_, i) => i + 8);

export const PERMISSION_LABELS: Record<string, string> = {
  granted: 'Permitidas',
  denied: 'Bloqueadas en este navegador',
  default: 'Sin decidir',
  unsupported: 'No disponibles en este navegador',
};

export const NOTIFICATIONS_INTRO =
  'Activa las notificaciones de REFRUN para recibir recordatorios de partidos pendientes y de los kilómetros que todavía tienes que completar.';

/** Botón de activación + explicación según el soporte del dispositivo. Reutilizado en Inicio y Ajustes. */
export function EnablePushBlock({ onEnabled }: { onEnabled?: () => void }) {
  const support = pushSupport();
  const { permission, subscribed, refresh } = usePushState();
  const queryClient = useQueryClient();
  const enable = useMutation({
    mutationFn: enablePush,
    onSuccess: async (r) => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['push-devices'] });
      if (r === 'enabled') {
        toast.success('Notificaciones activadas en este dispositivo.');
        onEnabled?.();
      } else if (r === 'denied') toast.error('Has bloqueado las notificaciones. Puedes permitirlas en los ajustes del navegador.');
      else if (r === 'no-service-worker') toast.error('La app aún no está lista sin conexión. Recarga la página e inténtalo de nuevo.');
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });

  if (support === 'needs-install') {
    return (
      <p className="text-sm text-muted">
        En iPhone y iPad las notificaciones solo funcionan con REFRUN <strong className="text-fg">añadida a la pantalla de inicio</strong> (Safari →
        Compartir → Añadir a pantalla de inicio) y con iOS 16.4 o posterior. Abre la app desde ese icono y activa aquí las notificaciones.
      </p>
    );
  }
  if (support === 'unsupported') {
    return <p className="text-sm text-muted">Este navegador no admite notificaciones push. Prueba con Chrome, Edge, Firefox o Safari actualizados.</p>;
  }
  if (support === 'unconfigured') {
    return (
      <p className="text-sm text-muted">
        Las notificaciones todavía no están configuradas en esta publicación de REFRUN (falta la clave pública VAPID). Avisa al administrador.
      </p>
    );
  }
  if (permission === 'denied') {
    return (
      <p className="text-sm text-muted">
        Has bloqueado las notificaciones para REFRUN. Para recibirlas, permítelas en los ajustes del navegador (icono del candado junto a la
        dirección) o del sistema, y vuelve aquí.
      </p>
    );
  }
  if (permission === 'granted' && subscribed) {
    return (
      <p className="flex items-center gap-2 text-sm text-accent-text">
        <Bell className="size-4" aria-hidden /> Este dispositivo recibe las notificaciones de REFRUN.
      </p>
    );
  }
  return (
    <Button size="sm" onClick={() => enable.mutate()} loading={enable.isPending}>
      <Bell aria-hidden /> Activar notificaciones
    </Button>
  );
}

export function NotificationSettingsCard() {
  const user = useUser();
  const { season, group } = useActiveGroup();
  const queryClient = useQueryClient();
  const push = usePushState();
  const settingsQuery = useQuery({ queryKey: ['notification-settings', user.id], queryFn: () => getNotificationSettings(user.id) });
  const devicesQuery = useQuery({ queryKey: ['push-devices', user.id], queryFn: () => listMyDevices(user.id) });
  const logQuery = useQuery({ queryKey: ['notification-log', user.id], queryFn: () => listMyNotifications(user.id, 5) });
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);

  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data);
  }, [settingsQuery.data]);
  useEffect(() => {
    void currentSubscription()
      .then((s) => setThisEndpoint(s?.endpoint ?? null))
      .catch(() => setThisEndpoint(null));
  }, [push.subscribed]);

  const save = useMutation({
    mutationFn: (v: NotificationSettings) => saveNotificationSettings(user.id, v),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notification-settings', user.id] });
      toast.success('Preferencias de notificaciones guardadas.');
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });
  const removeDevice = useMutation({
    mutationFn: async (d: { id: string; endpoint: string }) => {
      if (d.endpoint === thisEndpoint) await disablePush();
      else await deletePushDevice(d.id);
    },
    onSuccess: async () => {
      await push.refresh();
      await queryClient.invalidateQueries({ queryKey: ['push-devices', user.id] });
      toast.success('Dispositivo eliminado: ya no recibirá notificaciones.');
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });

  const tz = season?.timezone ?? group.timezone;
  const dirty = !!draft && !!settingsQuery.data && JSON.stringify(draft) !== JSON.stringify(settingsQuery.data);
  const set = <K extends keyof NotificationSettings>(k: K, v: NotificationSettings[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setDay = (i: 0 | 1, day: number) => setDraft((d) => (d ? { ...d, km_days: i === 0 ? [day, d.km_days[1]!] : [d.km_days[0]!, day] } : d));
  const sameDays = !!draft && draft.km_days[0] === draft.km_days[1];

  return (
    <Card id="notificaciones">
      <CardHeader title="Notificaciones" />
      <div className="space-y-5 p-4 sm:p-5">
        <div className="space-y-3">
          <p className="text-sm text-muted">{NOTIFICATIONS_INTRO}</p>
          <EnablePushBlock />
          <p className="text-xs text-muted">
            Permiso del navegador: <strong className="text-fg">{PERMISSION_LABELS[push.permission]}</strong>
          </p>
        </div>

        {settingsQuery.isLoading || !draft ? (
          settingsQuery.error ? (
            <ErrorBlock message={toUserMessage(settingsQuery.error)} onRetry={() => void settingsQuery.refetch()} />
          ) : (
            <LoadingBlock />
          )
        ) : (
          <form
            className="space-y-4 border-t border-border/60 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!sameDays) save.mutate(draft);
            }}
          >
            <Checkbox
              label="Recibir notificaciones de REFRUN"
              description="Desactívalo para no recibir ningún aviso en ninguno de tus dispositivos."
              checked={draft.enabled}
              onChange={(v) => set('enabled', v)}
            />
            <fieldset disabled={!draft.enabled} className="space-y-4 disabled:opacity-60">
              <Checkbox
                label="Recordatorio de registrar el partido"
                description={`Solo si aún no has registrado el partido del fin de semana. Días y hora los fija el administrador del grupo (${group.match_reminder_days
                  .map((d) => DAY_LABELS[d]?.toLowerCase())
                  .join(' y ')} a las ${group.match_reminder_hour}:00).`}
                checked={draft.match_reminders}
                onChange={(v) => set('match_reminders', v)}
              />
              <Checkbox
                label="Recordatorio de kilómetros pendientes"
                description="Solo si tienes una deuda real. Si te pones al día recibirás un único aviso de felicitación y ninguno más."
                checked={draft.km_reminders}
                onChange={(v) => set('km_reminders', v)}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Primer día" error={sameDays ? 'Elige dos días distintos' : undefined}>
                  <Select value={draft.km_days[0]} onChange={(e) => setDay(0, Number(e.target.value))} disabled={!draft.km_reminders}>
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {DAY_LABELS[d]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Segundo día">
                  <Select value={draft.km_days[1]} onChange={(e) => setDay(1, Number(e.target.value))} disabled={!draft.km_reminders}>
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {DAY_LABELS[d]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Hora" hint={`Zona horaria ${tz}`}>
                  <Select value={draft.remind_hour} onChange={(e) => set('remind_hour', Number(e.target.value))} disabled={!draft.km_reminders}>
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, '0')}:00
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </fieldset>
            <Button type="submit" size="sm" disabled={!dirty || sameDays} loading={save.isPending}>
              Guardar preferencias
            </Button>
          </form>
        )}

        <div className="space-y-2 border-t border-border/60 pt-4">
          <h3 className="text-sm font-semibold">Dispositivos que reciben avisos</h3>
          {devicesQuery.isLoading ? (
            <LoadingBlock />
          ) : (devicesQuery.data ?? []).length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <BellOff className="size-4" aria-hidden /> Ningún dispositivo registrado.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
              {(devicesQuery.data ?? []).map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <Smartphone className="size-4 shrink-0 text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {describeDevice(d.user_agent)}
                      {d.endpoint === thisEndpoint && <span className="ml-1.5 text-xs text-accent-text">(este dispositivo)</span>}
                    </p>
                    <p className="text-xs text-muted">
                      Alta {formatRelative(d.created_at)}
                      {d.last_success_at ? ` · último aviso ${formatRelative(d.last_success_at)}` : ''}
                      {d.last_error ? ` · error: ${d.last_error}` : ''}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Dejar de enviar avisos a este dispositivo"
                    loading={removeDevice.isPending && removeDevice.variables?.id === d.id}
                    onClick={() => removeDevice.mutate({ id: d.id, endpoint: d.endpoint })}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(logQuery.data ?? []).length > 0 && (
          <div className="space-y-2 border-t border-border/60 pt-4">
            <h3 className="text-sm font-semibold">Últimos avisos enviados</h3>
            <ul className="space-y-1.5 text-xs text-muted">
              {(logQuery.data ?? []).map((n) => (
                <li key={n.id}>
                  <span className="text-fg">{n.body}</span> · {formatRelative(n.sent_at)}
                  {n.devices_ok === 0 ? ' · no se pudo entregar' : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

export function describeDevice(ua: string | null): string {
  if (!ua) return 'Dispositivo';
  const os = /iphone|ipad/i.test(ua) ? 'iPhone/iPad' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : /linux/i.test(ua) ? 'Linux' : 'Dispositivo';
  const browser = /edg\//i.test(ua) ? 'Edge' : /firefox/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : '';
  return browser ? `${os} · ${browser}` : os;
}

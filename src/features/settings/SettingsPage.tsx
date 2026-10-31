import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Download, LogOut, RotateCcw, Smartphone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/misc';
import { useAuth } from '@/features/auth/AuthProvider';
import { useActiveGroup } from '@/features/group/GroupProvider';
import { TIMEZONES } from '@/features/group/onboarding';
import { isInstallPromptDismissed, resetInstallPromptPreference, useIsStandalone } from '@/features/pwa/install';
import { InstallInstructions } from '@/features/pwa/InstallInstructions';
import { DAY_LABELS, DAYS, HOURS, NotificationSettingsCard } from '@/features/notifications/NotificationSettingsCard';
import { toUserMessage } from '@/lib/errors';
import { resetAllPrefs } from '@/lib/storage';
import { useTheme, type ThemePref } from '@/lib/theme';
import { signOut, updateGroup } from '@/services/api';

function Row({ children, onClick, to }: { children: ReactNode; onClick?: () => void; to?: string }) {
  const cls = 'flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm hover:bg-surface-2/60 sm:px-5';
  if (to) {
    return (
      <Link to={to} className={cls}>
        {children}
        <ChevronRight className="size-4 text-muted" aria-hidden />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
      <ChevronRight className="size-4 text-muted" aria-hidden />
    </button>
  );
}

export function SettingsPage() {
  const { pref, setPref } = useTheme();
  const { user } = useAuth();
  const { group, isAdmin, memberships, setActiveGroup } = useActiveGroup();
  const standalone = useIsStandalone();
  const [installOpen, setInstallOpen] = useState(false);
  const [dismissed, setDismissed] = useState(isInstallPromptDismissed);
  const navigate = useNavigate();

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="space-y-5">
        <Card>
          <CardHeader title="Cuenta" />
          <div className="mt-2 divide-y divide-border/60 pb-1">
            <p className="px-4 py-3 text-sm text-muted sm:px-5">
              Sesión iniciada como <span className="font-medium text-fg">{user?.email}</span>
            </p>
            <Row to="/perfil">Editar perfil (nombre y color)</Row>
            <Row to="/recuperar">Cambiar contraseña</Row>
          </div>
        </Card>

        <Card>
          <CardHeader title="Apariencia" />
          <div className="p-4 sm:p-5">
            <Segmented<ThemePref>
              label="Tema"
              value={pref}
              onChange={setPref}
              options={[
                { value: 'dark', label: 'Oscuro' },
                { value: 'light', label: 'Claro' },
                { value: 'system', label: 'Sistema' },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Instalación" />
          <div className="mt-2 divide-y divide-border/60 pb-1">
            <p className="flex items-center gap-2 px-4 py-3 text-sm sm:px-5">
              <Smartphone className="size-4 text-accent-text" aria-hidden />
              {standalone ? 'Estás usando REFRUN como app instalada.' : 'Estás usando REFRUN desde el navegador.'}
            </p>
            <Row onClick={() => setInstallOpen(true)}>Cómo añadir REFRUN a la pantalla de inicio</Row>
            {dismissed && (
              <Row
                onClick={() => {
                  resetInstallPromptPreference();
                  setDismissed(false);
                  toast.success('La sugerencia de instalación volverá a aparecer.');
                }}
              >
                Volver a mostrar la sugerencia de instalación
              </Row>
            )}
          </div>
        </Card>

        <NotificationSettingsCard />

        {memberships.length > 1 && (
          <Card>
            <CardHeader title="Grupo activo" />
            <div className="p-4 sm:p-5">
              <Select value={group.id} onChange={(e) => setActiveGroup(e.target.value)} aria-label="Grupo activo">
                {memberships.map((m) => (
                  <option key={m.group.id} value={m.group.id}>
                    {m.group.name}
                  </option>
                ))}
              </Select>
            </div>
          </Card>
        )}

        {isAdmin && <GroupSettings />}

        <Card>
          <CardHeader title="Datos y privacidad" />
          <div className="mt-2 divide-y divide-border/60 pb-1">
            <Row to="/temporada">
              <span className="flex items-center gap-2">
                <Download className="size-4 text-muted" aria-hidden /> Exportar datos de la temporada
              </span>
            </Row>
            <Row
              onClick={() => {
                resetAllPrefs();
                setDismissed(false);
                toast.success('Preferencias locales restablecidas. Tus datos del servidor no cambian.');
              }}
            >
              <span className="flex items-center gap-2">
                <RotateCcw className="size-4 text-muted" aria-hidden /> Restablecer preferencias de este dispositivo
              </span>
            </Row>
            <Row to="/ayuda">Privacidad y funcionamiento</Row>
          </div>
        </Card>

        <Button
          variant="danger"
          block
          onClick={() =>
            void signOut()
              .then(() => navigate('/acceso', { replace: true }))
              .catch((e) => toast.error(toUserMessage(e)))
          }
        >
          <LogOut aria-hidden /> Cerrar sesión
        </Button>
        <p className="text-center text-xs text-muted">REFRUN v{__APP_VERSION__}</p>
      </div>

      <Dialog open={installOpen} onOpenChange={setInstallOpen} title="Instalar REFRUN">
        <InstallInstructions />
      </Dialog>
    </>
  );
}

function GroupSettings() {
  const { group } = useActiveGroup();
  const queryClient = useQueryClient();
  const [name, setName] = useState(group.name);
  const [tz, setTz] = useState(group.timezone);
  const [days, setDays] = useState<number[]>(group.match_reminder_days);
  const [hour, setHour] = useState(group.match_reminder_hour);
  const save = useMutation({
    mutationFn: () => updateGroup(group.id, { name: name.trim(), timezone: tz, match_reminder_days: days, match_reminder_hour: hour }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['memberships'] });
      toast.success('Grupo actualizado.');
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });
  const dirty =
    name.trim() !== group.name || tz !== group.timezone || hour !== group.match_reminder_hour || days.join() !== group.match_reminder_days.join();
  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => ((a % 7) - (b % 7)))));
  const daysError = days.length === 0 ? 'Elige al menos un día' : days.length > 2 ? 'Como máximo dos días' : undefined;
  return (
    <Card>
      <CardHeader title="Grupo" eyebrow="Administración" />
      <form
        className="space-y-4 p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Nombre del grupo">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field label="Zona horaria por defecto" hint="Las temporadas tienen su propia zona horaria.">
          <Select value={tz} onChange={(e) => setTz(e.target.value)}>
            {[...new Set([tz, ...TIMEZONES])].map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="space-y-3 rounded-xl border border-border/70 p-3">
          <legend className="px-1 text-sm font-medium">Recordatorio de registrar el partido</legend>
          <p className="text-xs text-muted">
            Se envía solo a quien aún no ha registrado el partido del último fin de semana y tiene activado este aviso. Uno o dos días por semana.
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Días del recordatorio de partido">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(d)}
                onClick={() => toggleDay(d)}
                className={
                  days.includes(d)
                    ? 'rounded-full border border-accent/60 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent-text'
                    : 'rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:text-fg'
                }
              >
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
          {daysError && (
            <p role="alert" className="text-xs font-medium text-danger">
              {daysError}
            </p>
          )}
          <Field label="Hora" hint="Hora local de la temporada.">
            <Select value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>
        <Button type="submit" size="sm" disabled={!dirty || name.trim().length < 2 || !!daysError} loading={save.isPending}>
          Guardar
        </Button>
      </form>
    </Card>
  );
}

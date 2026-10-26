import { Flag, Footprints, Goal } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import brand from '@/config/brand.json';

const steps = [
  { icon: Flag, title: 'Arbitras', text: 'Registras el resultado de tu primer partido del fin de semana.' },
  { icon: Goal, title: 'Goles = km', text: 'Un 13-1 son 14 km de objetivo para tu semana.' },
  { icon: Footprints, title: 'Corres y sumas', text: 'Subes tus carreras y ves cómo va todo el grupo.' },
];

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · ${brand.name}`;
  }, [title]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg">
      {/* Fondo: textura de pista y halo lima */}
      <div aria-hidden className="track-texture pointer-events-none absolute inset-0 opacity-70" />
      <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-accent/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-[1.1fr_1fr]">
        <section className="hidden flex-col justify-between p-12 lg:flex">
          <Logo size="lg" />
          <div>
            <p className="eyebrow mb-4 text-accent-text">Reto de temporada</p>
            <h2 className="font-display text-6xl font-bold uppercase italic leading-[0.92] tracking-tight">
              Cada gol
              <br />
              del partido,
              <br />
              <span className="text-accent-text">un kilómetro</span>
              <br />
              en tu semana.
            </h2>
            <ul className="mt-10 grid max-w-xl grid-cols-3 gap-4">
              {steps.map((s) => (
                <li key={s.title} className="card p-4">
                  <s.icon className="mb-3 size-5 text-accent-text" aria-hidden />
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{s.text}</p>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted">Grupo privado de árbitros de hockey sobre patines.</p>
        </section>

        <section className="flex flex-col px-5 pb-10 pt-[calc(2.5rem+env(safe-area-inset-top))] sm:px-10 lg:justify-center">
          <div className="lg:hidden">
            <Logo size="md" />
            <p className="mt-4 max-w-xs text-[15px] leading-snug text-muted">{brand.tagline}</p>
          </div>
          <div className="mt-8 w-full max-w-md lg:mx-auto lg:mt-0">
            <div className="card p-6 sm:p-8">
              <h1 className="font-display text-3xl font-bold uppercase italic tracking-tight">{title}</h1>
              {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
              <div className="mt-6">{children}</div>
            </div>
          </div>
          <ul className="mt-8 grid gap-3 sm:grid-cols-3 lg:hidden">
            {steps.map((s) => (
              <li key={s.title} className="flex gap-3 rounded-2xl border border-border/60 bg-surface/60 p-3">
                <s.icon className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden />
                <div>
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-xs text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export function FormAlert({ tone = 'danger', children }: { tone?: 'danger' | 'success' | 'info'; children: ReactNode }) {
  const tones = {
    danger: 'border-danger/40 bg-danger/10 text-danger',
    success: 'border-success/40 bg-success/10 text-success',
    info: 'border-info/40 bg-info/10 text-info',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

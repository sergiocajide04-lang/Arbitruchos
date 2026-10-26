import { Camera, ChevronRight, Flag, PenLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';

const options = [
  {
    to: '/anadir/entrenamiento',
    icon: Camera,
    title: 'Registrar entrenamiento',
    text: 'Sube la captura de Strava, Apple Fitness o la máquina del gimnasio y revisa los datos detectados.',
    primary: true,
  },
  {
    to: '/anadir/entrenamiento?modo=manual',
    icon: PenLine,
    title: 'Entrenamiento a mano',
    text: 'Si no tienes captura o el reconocimiento falla, introduce los datos tú mismo.',
  },
  {
    to: '/anadir/partido',
    icon: Flag,
    title: 'Registrar partido',
    text: 'Introduce el resultado de tu primer partido del fin de semana: los goles marcan tus kilómetros.',
  },
];

export function AddPage() {
  return (
    <>
      <PageHeader title="Añadir" subtitle="¿Qué quieres registrar?" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {options.map((o) => (
          <li key={o.to} className={o.primary ? 'sm:col-span-2' : ''}>
            <Link
              to={o.to}
              className={`group flex items-center gap-4 rounded-2xl border p-5 transition-all active:scale-[0.99] ${
                o.primary ? 'border-accent/40 bg-accent text-accent-fg shadow-glow' : 'border-border/70 bg-surface hover:border-accent/40'
              }`}
            >
              <span
                className={`grid size-12 shrink-0 place-items-center rounded-xl ${o.primary ? 'bg-accent-fg/10' : 'bg-surface-2 text-accent-text'}`}
              >
                <o.icon className="size-6" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{o.title}</span>
                <span className={`mt-0.5 block text-sm ${o.primary ? 'text-accent-fg/75' : 'text-muted'}`}>{o.text}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

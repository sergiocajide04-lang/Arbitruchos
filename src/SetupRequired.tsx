import { Logo } from '@/components/brand/Logo';

/** Se muestra si faltan las variables públicas de Supabase (instalación sin configurar). */
export function SetupRequired() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6">
      <div className="card max-w-lg p-6 sm:p-8">
        <Logo />
        <h1 className="mt-6 text-xl font-semibold">Falta configurar la conexión con Supabase</h1>
        <p className="mt-2 text-sm text-muted">
          Esta instalación de REFRUN no tiene definidas las variables públicas del proyecto. Pide al administrador que las configure:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-surface-2 p-3 text-xs">
          VITE_SUPABASE_URL=https://xxxx.supabase.co{'\n'}VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
        </pre>
        <p className="mt-4 text-xs text-muted">
          En local, cópialas en <code>.env.local</code>. En GitHub Pages, defínelas como variables del repositorio (ver README).
        </p>
      </div>
    </main>
  );
}

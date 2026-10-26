import '@fontsource-variable/inter';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/700-italic.css';
import '@/styles/index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppRoutes } from '@/App';
import { applyTheme } from '@/lib/theme';
import { members, state } from '../ui/mocks';
import { extraMembers } from './mock-api';

// Arnés visual de desarrollo: ?ruta=/clasificacion&tema=light&auth=out&install=1
const params = new URLSearchParams(location.search);
applyTheme(params.get('tema') === 'light' ? 'light' : 'dark');
if (params.get('auth') === 'out') state.status = 'signed_out';
if (params.get('admin') === '1') state.isAdmin = true;
if (params.get('install') !== '1') localStorage.setItem('refrun_install_prompt_dismissed_v1', '1');
else localStorage.removeItem('refrun_install_prompt_dismissed_v1');
localStorage.removeItem('refrun_install_prompt_snoozed_until_v1');

for (const e of extraMembers) {
  if (!members.some((m) => m.user_id === e.id)) {
    members.push({
      group_id: 'g1',
      user_id: e.id,
      role: 'member',
      status: 'active',
      joined_at: '2026-09-03T10:00:00Z',
      profile: { id: e.id, display_name: e.name, avatar_color: e.color, created_at: '2026-09-03T10:00:00Z' },
    });
  }
}

// Nombres del grupo en la vista previa (el orden coincide con los usuarios de prueba).
const NAMES = ['Sergio Cajide', 'Cristian Fernández', 'Carlos Chouciño', 'David Castro', 'Enrique Abelenda'];
members.forEach((m, i) => {
  if (NAMES[i]) m.profile.display_name = NAMES[i]!;
  m.role = i === 0 ? 'owner' : 'member';
});
if (params.get('admin') !== '0') state.isAdmin = true;

if (params.get('debug') === '1') {
  const tag = document.createElement('div');
  tag.style.cssText = 'position:fixed;top:0;right:0;z-index:99999;background:red;color:#fff;font:12px monospace;padding:2px';
  const upd = () => (tag.textContent = `vw=${window.innerWidth} sw=${document.documentElement.scrollWidth}`);
  document.body.appendChild(tag);
  setInterval(upd, 300);
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[params.get('ruta') ?? '/']}>
      <AppRoutes />
    </MemoryRouter>
    <Toaster position="top-center" />
  </QueryClientProvider>,
);

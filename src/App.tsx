import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { AddPage } from '@/features/add/AddPage';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { RequireAuth, RequireGroup } from '@/features/auth/guards';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from '@/features/auth/pages';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { JoinPage, OnboardingPage } from '@/features/group/onboarding';
import { UpdatePrompt } from '@/features/pwa/UpdatePrompt';
import { useTheme } from '@/lib/theme';
import { SetupRequired } from './SetupRequired';
import { isSupabaseConfigured } from '@/lib/supabase';

// Páginas con dependencias pesadas (gráficos, OCR) se cargan bajo demanda.
const StatsPage = lazy(() => import('@/features/stats/StatsPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const MembersPage = lazy(() => import('@/features/group/MembersPage').then((m) => ({ default: m.MembersPage })));
const HistoryPage = lazy(() => import('@/features/history/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const NewMatchPage = lazy(() => import('@/features/matches/NewMatchPage').then((m) => ({ default: m.NewMatchPage })));
const RankingPage = lazy(() => import('@/features/ranking/RankingPage').then((m) => ({ default: m.RankingPage })));
const SeasonPage = lazy(() => import('@/features/seasons/SeasonPage').then((m) => ({ default: m.SeasonPage })));
const HelpPage = lazy(() => import('@/features/settings/HelpPage').then((m) => ({ default: m.HelpPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const WorkoutDetailPage = lazy(() => import('@/features/workouts/WorkoutDetailPage').then((m) => ({ default: m.WorkoutDetailPage })));
const WorkoutsPage = lazy(() => import('@/features/workouts/WorkoutsPage').then((m) => ({ default: m.WorkoutsPage })));
const NewWorkoutPage = lazy(() => import('@/features/workouts/NewWorkoutPage').then((m) => ({ default: m.NewWorkoutPage })));

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: (count, error) => count < 2 && !/permission|row-level|JWT/i.test(String((error as Error)?.message)),
        refetchOnWindowFocus: true,
      },
      mutations: { networkMode: 'online', retry: 0 },
    },
  });
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/acceso" element={<LoginPage />} />
      <Route path="/registro" element={<SignupPage />} />
      <Route path="/recuperar" element={<ForgotPasswordPage />} />
      <Route path="/restablecer" element={<ResetPasswordPage />} />
      <Route path="/unirse" element={<JoinPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/bienvenida" element={<OnboardingPage />} />
        <Route element={<RequireGroup />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="entrenamientos" element={<WorkoutsPage />} />
            <Route path="entrenamientos/:id" element={<WorkoutDetailPage />} />
            <Route path="anadir" element={<AddPage />} />
            <Route path="anadir/entrenamiento" element={<NewWorkoutPage />} />
            <Route path="anadir/partido" element={<NewMatchPage />} />
            <Route path="clasificacion" element={<RankingPage />} />
            <Route path="estadisticas" element={<StatsPage />} />
            <Route path="perfil" element={<ProfilePage />} />
            <Route path="miembros" element={<MembersPage />} />
            <Route path="miembros/:userId" element={<ProfilePage />} />
            <Route path="temporada" element={<SeasonPage />} />
            <Route path="historial" element={<HistoryPage />} />
            <Route path="ajustes" element={<SettingsPage />} />
            <Route path="ayuda" element={<HelpPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

const queryClient = createQueryClient();

export function App() {
  useTheme();
  if (!isSupabaseConfigured) {
    return (
      <>
        <SetupRequired />
        <UpdatePrompt />
      </>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
      <UpdatePrompt />
      <Toaster
        position="top-center"
        theme="system"
        toastOptions={{
          classNames: {
            toast: '!rounded-2xl !border !border-border !bg-surface !text-fg !shadow-2xl',
            description: '!text-muted',
          },
        }}
      />
    </QueryClientProvider>
  );
}

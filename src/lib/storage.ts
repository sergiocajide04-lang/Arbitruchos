/**
 * Preferencias locales NO sensibles (versionadas). Nunca se guardan aquí
 * partidos, entrenamientos ni imágenes: los datos definitivos viven en Supabase.
 * Todas las lecturas toleran que el almacenamiento esté vacío o bloqueado.
 */
export const PREF_KEYS = {
  installDismissed: 'refrun_install_prompt_dismissed_v1',
  installSnoozedUntil: 'refrun_install_prompt_snoozed_until_v1',
  theme: 'refrun_theme_v1',
  activeGroup: 'refrun_active_group_v1',
  rankingSort: 'refrun_ranking_sort_v1',
  pendingInvite: 'refrun_pending_invite_v1',
  draftMatch: 'refrun_draft_match_v1',
  draftWorkout: 'refrun_draft_workout_v1',
} as const;

export type PrefKey = (typeof PREF_KEYS)[keyof typeof PREF_KEYS];

export function readPref(key: PrefKey): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: PrefKey, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible: la preferencia no persiste */
  }
}

export function removePref(key: PrefKey): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* sin efecto */
  }
}

export function readJsonPref<T>(key: PrefKey): T | null {
  const raw = readPref(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    removePref(key);
    return null;
  }
}

export function writeJsonPref(key: PrefKey, value: unknown): void {
  writePref(key, JSON.stringify(value));
}

/** Restablece todas las preferencias de interfaz (no afecta a los datos del servidor). */
export function resetAllPrefs(): void {
  for (const key of Object.values(PREF_KEYS)) removePref(key);
}

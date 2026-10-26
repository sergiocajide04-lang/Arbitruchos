/** Traduce errores de Supabase/Postgres/red a mensajes comprensibles en español. */

interface ErrorLike {
  message?: string;
  code?: string;
  details?: string | null;
  status?: number;
  name?: string;
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  matches_one_per_referee_week: 'Ese árbitro ya tiene un partido asignado a esa semana. Corrige el existente en lugar de crear otro.',
  workouts_idempotency: 'Este entrenamiento ya se había enviado.',
  workouts_distance_normalized: 'La distancia normalizada no coincide con la unidad indicada.',
  seasons_one_active_per_group: 'Ya hay otra temporada activa. Ciérrala o déjala planificada antes de activar esta.',
};

const AUTH_MESSAGES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/email not confirmed/i, 'Confirma tu correo con el enlace que te hemos enviado antes de entrar.'],
  [/user already registered|already been registered/i, 'Ya existe una cuenta con ese correo. Inicia sesión o recupera la contraseña.'],
  [/password should be at least|weak password/i, 'La contraseña es demasiado débil. Usa al menos 8 caracteres.'],
  [/rate limit|too many requests|security purposes/i, 'Demasiados intentos. Espera unos minutos y vuelve a probar.'],
  [/unable to validate email|invalid email/i, 'El correo no es válido.'],
  [/same password|different from the old/i, 'La nueva contraseña debe ser distinta de la anterior.'],
  [/auth session missing|jwt expired|invalid jwt/i, 'Tu sesión ha caducado. Vuelve a iniciar sesión.'],
  [/signups not allowed|signup is disabled/i, 'El registro de nuevas cuentas está deshabilitado.'],
];

export function toUserMessage(error: unknown, fallback = 'Ha ocurrido un error inesperado.'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  const e = error as ErrorLike;
  const msg = e.message ?? '';

  if (e.name === 'OcrError') return msg;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.';
  }

  for (const [constraint, text] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (msg.includes(constraint) || e.details?.includes(constraint)) return text;
  }

  if (e.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    // Mensajes propios de los triggers (en español) se muestran tal cual.
    if (/[áéíóúñ¿¡]|^(Solo|No |El |La |Los |Las |Debes|Indica|Has )/.test(msg) && !/permission denied/i.test(msg)) return msg;
    return 'No tienes permiso para realizar esta acción.';
  }
  // Excepciones de negocio lanzadas por la base de datos (mensajes ya en español).
  if (e.code === '23514' || e.code === 'P0001') {
    if (/violates check constraint/i.test(msg)) return 'Algún valor está fuera del rango permitido.';
    return msg;
  }
  if (e.code === '23505') return 'Ese registro ya existe.';
  if (e.code === '23503') return 'El registro está relacionado con otros datos y no puede modificarse así.';
  if (e.code === 'PGRST301' || e.status === 401) return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';

  for (const [re, text] of AUTH_MESSAGES) if (re.test(msg)) return text;

  return msg && /[áéíóúñ]/i.test(msg) ? msg : fallback;
}

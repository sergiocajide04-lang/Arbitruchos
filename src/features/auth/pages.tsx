import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { toUserMessage } from '@/lib/errors';
import { PREF_KEYS, writePref } from '@/lib/storage';
import { sendPasswordReset, signIn, signUp, updatePassword } from '@/services/api';
import { AuthLayout, FormAlert } from './AuthLayout';
import { useAuth } from './AuthProvider';
import { emailSchema, formatInviteCode, loginSchema, resetSchema, signupSchema } from './schemas';

const forgotSchema = z.object({ email: emailSchema });

const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} ref={ref} type={visible ? 'text' : 'password'} className="pr-12" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted hover:text-fg"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
});

// ---------------------------------------------------------------------------
export function LoginPage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const { errors, isSubmitting } = form.formState;

  if (status === 'signed_in') return <Navigate to={params.get('volver') ?? '/'} replace />;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await signIn(v.email, v.password);
      navigate(params.get('volver') ?? '/', { replace: true });
    } catch (e) {
      setError(toUserMessage(e));
    }
  });

  return (
    <AuthLayout title="Entrar" subtitle="Accede al reto de tu grupo.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <FormAlert>{error}</FormAlert>}
        <Field label="Correo electrónico" error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
        </Field>
        <Field
          label="Contraseña"
          error={errors.password?.message}
          trailing={
            <Link to="/recuperar" className="text-xs font-medium text-accent-text hover:underline">
              ¿La has olvidado?
            </Link>
          }
        >
          <PasswordInput autoComplete="current-password" {...form.register('password')} />
        </Field>
        <Button type="submit" block size="lg" loading={isSubmitting}>
          Entrar
        </Button>
      </form>
      <div className="mt-6 space-y-2 text-center text-sm text-muted">
        <p>
          ¿Aún no tienes cuenta?{' '}
          <Link to="/registro" className="font-semibold text-accent-text hover:underline">
            Crear cuenta
          </Link>
        </p>
        <p>
          ¿Te han invitado?{' '}
          <Link to="/unirse" className="font-semibold text-accent-text hover:underline">
            Usar código de invitación
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------
export function SignupPage() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<z.input<typeof signupSchema>, unknown, z.output<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { displayName: '', email: '', password: '', inviteCode: formatInviteCode(params.get('codigo') ?? '') },
  });
  const { errors, isSubmitting } = form.formState;

  if (status === 'signed_in') return <Navigate to="/" replace />;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      // El código se canjea al entrar por primera vez (necesita sesión iniciada).
      if (v.inviteCode) writePref(PREF_KEYS.pendingInvite, v.inviteCode);
      const { needsConfirmation } = await signUp(v.email, v.password, v.displayName);
      if (needsConfirmation) setSentTo(v.email);
    } catch (e) {
      setError(toUserMessage(e));
    }
  });

  if (sentTo) {
    return (
      <AuthLayout title="Revisa tu correo">
        <div className="flex flex-col items-center text-center">
          <MailCheck className="mb-4 size-12 text-accent-text" aria-hidden />
          <p className="text-sm">
            Te hemos enviado un enlace de confirmación a <strong>{sentTo}</strong>. Ábrelo desde este mismo dispositivo para activar tu cuenta.
          </p>
          <p className="mt-3 text-xs text-muted">¿No llega? Revisa la carpeta de spam o espera unos minutos.</p>
          <Button asChild variant="secondary" className="mt-6">
            <Link to="/acceso">Ir a iniciar sesión</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Crear cuenta" subtitle="Solo podrás ver los datos de un grupo cuando te unas con una invitación.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <FormAlert>{error}</FormAlert>}
        <Field label="Nombre deportivo" hint="Así te verán en la clasificación." error={errors.displayName?.message}>
          <Input autoComplete="nickname" maxLength={40} {...form.register('displayName')} />
        </Field>
        <Field label="Correo electrónico" error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
        </Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres, con letras y números." error={errors.password?.message}>
          <PasswordInput autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Field label="Código de invitación" optional error={errors.inviteCode?.message}>
          <Input
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="ABCDE-12345"
            className="font-mono uppercase tracking-widest"
            {...form.register('inviteCode', { onChange: (e) => form.setValue('inviteCode', formatInviteCode(e.target.value)) })}
          />
        </Field>
        <Button type="submit" block size="lg" loading={isSubmitting}>
          Crear cuenta
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        ¿Ya tienes cuenta?{' '}
        <Link to="/acceso" className="font-semibold text-accent-text hover:underline">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------
export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (e) {
      setError(toUserMessage(e));
    }
  });

  return (
    <AuthLayout title="Recuperar acceso" subtitle="Te enviaremos un enlace para elegir una contraseña nueva.">
      {sent ? (
        <FormAlert tone="success">
          Si existe una cuenta con ese correo, recibirás un enlace en unos minutos. Ábrelo en este dispositivo.
        </FormAlert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <FormAlert>{error}</FormAlert>}
          <Field label="Correo electrónico" error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
          </Field>
          <Button type="submit" block size="lg" loading={form.formState.isSubmitting}>
            Enviar enlace
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/acceso" className="font-semibold text-accent-text hover:underline">
          Volver a entrar
        </Link>
      </p>
    </AuthLayout>
  );
}

// ---------------------------------------------------------------------------
export function ResetPasswordPage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirm: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await updatePassword(v.password);
      navigate('/', { replace: true });
    } catch (e) {
      setError(toUserMessage(e));
    }
  });

  if (status === 'loading') return null;
  if (status === 'signed_out') {
    return (
      <AuthLayout title="Enlace no válido">
        <FormAlert>El enlace ha caducado o ya se ha usado. Solicita uno nuevo.</FormAlert>
        <Button asChild block className="mt-4">
          <Link to="/recuperar">Solicitar otro enlace</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Nueva contraseña">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <FormAlert>{error}</FormAlert>}
        <Field label="Contraseña nueva" hint="Mínimo 8 caracteres, con letras y números." error={errors.password?.message}>
          <PasswordInput autoComplete="new-password" {...form.register('password')} />
        </Field>
        <Field label="Repite la contraseña" error={errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" {...form.register('confirm')} />
        </Field>
        <Button type="submit" block size="lg" loading={isSubmitting}>
          Guardar contraseña
        </Button>
      </form>
    </AuthLayout>
  );
}

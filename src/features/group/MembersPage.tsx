import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Link2, Share2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/field';
import { Avatar, Badge, ErrorBlock, LoadingBlock } from '@/components/ui/misc';
import { ROLE_LABELS, type MemberRole, type MemberWithProfile } from '@/domain/types';
import { useUser } from '@/features/auth/AuthProvider';
import { formatLongDate } from '@/lib/dates';
import { toUserMessage } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import { appUrl } from '@/lib/supabase';
import { createInvitation, listInvitations, revokeInvitation, updateMember } from '@/services/api';
import { useActiveGroup } from './GroupProvider';

export function MembersPage() {
  const user = useUser();
  const { group, members, isAdmin, isOwner } = useActiveGroup();
  const [inviting, setInviting] = useState(false);
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: (p: { userId: string; patch: { role?: MemberRole; status?: 'active' | 'inactive' } }) => updateMember(group.id, p.userId, p.patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members', group.id] });
      toast.success('Miembro actualizado.');
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });

  const canManage = (m: MemberWithProfile) =>
    isAdmin && m.user_id !== user.id && m.role !== 'owner' && (isOwner || m.role === 'member');

  return (
    <>
      <PageHeader
        title="Miembros"
        subtitle={`${members.filter((m) => m.status === 'active').length} árbitros activos en ${group.name}`}
        actions={
          isAdmin && (
            <Button size="sm" onClick={() => setInviting(true)}>
              <UserPlus aria-hidden /> Invitar
            </Button>
          )
        }
      />
      <div className="space-y-5">
        <Card>
          <ul className="divide-y divide-border/60">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Link to={m.user_id === user.id ? '/perfil' : `/miembros/${m.user_id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={m.profile.display_name} color={m.profile.avatar_color} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {m.profile.display_name}
                      {m.user_id === user.id && <span className="ml-1.5 text-xs font-medium text-accent-text">(tú)</span>}
                    </p>
                    <p className="text-xs text-muted">Desde el {formatLongDate(m.joined_at.slice(0, 10))}</p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  {m.status === 'inactive' && <Badge tone="warning">Inactivo</Badge>}
                  {canManage(m) ? (
                    <Select
                      aria-label={`Rol de ${m.profile.display_name}`}
                      value={m.status === 'inactive' ? 'inactive' : m.role}
                      disabled={update.isPending}
                      onChange={(e) => {
                        const v = e.target.value;
                        update.mutate({
                          userId: m.user_id,
                          patch: v === 'inactive' ? { status: 'inactive' } : { role: v as MemberRole, status: 'active' },
                        });
                      }}
                      className="h-9 w-auto rounded-lg py-0 text-sm"
                    >
                      <option value="member">Miembro</option>
                      {isOwner && <option value="admin">Administrador</option>}
                      <option value="inactive">Desactivar</option>
                    </Select>
                  ) : (
                    <Badge tone={m.role === 'member' ? 'neutral' : 'accent'}>{ROLE_LABELS[m.role]}</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <p className="text-xs text-muted">
          Desactivar a un miembro le retira el acceso, pero conserva sus partidos y entrenamientos en el historial. No hay límite de miembros.
        </p>
        {isAdmin && <InvitationsCard />}
      </div>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </>
  );
}

function InvitationsCard() {
  const { group } = useActiveGroup();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['invitations', group.id], queryFn: () => listInvitations(group.id) });
  const revoke = useMutation({
    mutationFn: revokeInvitation,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['invitations', group.id] }),
    onError: (e) => toast.error(toUserMessage(e)),
  });
  const now = Date.now();
  const active = (query.data ?? []).filter((i) => !i.revoked_at && new Date(i.expires_at).getTime() > now && i.use_count < i.max_uses);

  return (
    <Card>
      <CardHeader title="Invitaciones activas" eyebrow="Solo administradores" />
      <div className="p-4 pt-2 sm:p-5 sm:pt-2">
        {query.isLoading ? (
          <LoadingBlock />
        ) : query.error ? (
          <ErrorBlock message={toUserMessage(query.error)} />
        ) : active.length === 0 ? (
          <p className="text-sm text-muted">No hay invitaciones pendientes.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {active.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <KeyRound className="size-4 text-accent-text" aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">
                    •••••-•••{i.code_hint} {i.note && <span className="text-muted">· {i.note}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {ROLE_LABELS[i.role]} · {i.use_count}/{i.max_uses} usos · caduca {formatRelative(i.expires_at)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)} loading={revoke.isPending && revoke.variables === i.id}>
                  Revocar
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Por seguridad, el código completo solo se muestra al crearlo.</p>
      </div>
    </Card>
  );
}

function InviteDialog({ onClose }: { onClose(): void }) {
  const { group, isOwner } = useActiveGroup();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [uses, setUses] = useState('1');
  const [days, setDays] = useState('7');
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<{ code: string; expires_at: string } | null>(null);

  const create = useMutation({
    mutationFn: () => createInvitation({ groupId: group.id, role, maxUses: Number(uses), validDays: Number(days), note: note.trim() || undefined }),
    onSuccess: async (r) => {
      setCreated(r);
      await queryClient.invalidateQueries({ queryKey: ['invitations', group.id] });
    },
    onError: (e) => toast.error(toUserMessage(e)),
  });

  const link = created ? appUrl(`unirse?codigo=${created.code}`) : '';
  const message = created ? `Únete a ${group.name} en REFRUN con el código ${created.code}: ${link}` : '';

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado al portapapeles.');
    } catch {
      toast.error('No se ha podido copiar. Selecciona el texto manualmente.');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Invitación a REFRUN', text: message });
      } catch {
        /* el usuario canceló */
      }
    } else {
      await copy(message);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Invitar al grupo" description="Genera un código de un solo uso (o varios) con caducidad.">
      {created ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-accent/40 bg-accent/10 p-5 text-center">
            <p className="eyebrow">Código de invitación</p>
            <p className="mt-2 select-all font-mono text-3xl font-bold tracking-[0.2em]">{created.code}</p>
            <p className="mt-2 text-xs text-muted">Caduca {formatRelative(created.expires_at)}. Guárdalo: no se volverá a mostrar.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button variant="secondary" onClick={() => void copy(created.code)}>
              <Copy aria-hidden /> Código
            </Button>
            <Button variant="secondary" onClick={() => void copy(link)}>
              <Link2 aria-hidden /> Enlace
            </Button>
            <Button onClick={() => void share()}>
              <Share2 aria-hidden /> Compartir
            </Button>
          </div>
          <Button variant="ghost" block onClick={onClose}>
            Hecho
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rol">
              <Select value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')}>
                <option value="member">Miembro</option>
                {isOwner && <option value="admin">Administrador</option>}
              </Select>
            </Field>
            <Field label="Usos">
              <Select value={uses} onChange={(e) => setUses(e.target.value)}>
                {[1, 2, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Validez">
            <Select value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="1">1 día</option>
              <option value="3">3 días</option>
              <option value="7">7 días</option>
              <option value="14">14 días</option>
              <option value="30">30 días</option>
            </Select>
          </Field>
          <Field label="Nota" optional hint="Para recordar a quién se la enviaste.">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
          </Field>
          <Button type="submit" block loading={create.isPending}>
            Generar código
          </Button>
        </form>
      )}
    </Dialog>
  );
}

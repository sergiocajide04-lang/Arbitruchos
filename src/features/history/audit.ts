import { ACTIVITY_LABELS, POLICY_LABELS, ROLE_LABELS, SEASON_STATUS_LABELS, type AuditEvent, type Profile } from '@/domain/types';
import type { ActivityType, CompliancePolicy, MemberRole, SeasonStatus } from '@/domain/types';
import { formatPeriodRange, formatShortDate, matchPeriodOf } from '@/lib/dates';
import { formatKm } from '@/lib/format';

type Row = Record<string, unknown>;

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const n = (v: unknown) => Number(v ?? 0);

/** Texto legible de un evento de auditoría. */
export function describeAudit(ev: AuditEvent, profileOf: (id: string) => Profile | undefined): { title: string; detail?: string } {
  const b = (ev.before ?? {}) as Row;
  const a = (ev.after ?? {}) as Row;
  const row = ev.action === 'delete' ? b : a;
  const name = (id: unknown) => profileOf(s(id))?.display_name ?? 'un miembro';

  switch (ev.entity_type) {
    case 'matches': {
      const score = (r: Row) => `${s(r.home_goals)}-${s(r.away_goals)}`;
      if (ev.action === 'insert') {
        return {
          title: `registró el partido ${score(a)} de ${name(a.referee_id)}`,
          detail: `+${s(a.target_km)} km · periodo ${formatPeriodRange(matchPeriodOf(s(a.match_date)))}`,
        };
      }
      if (ev.action === 'delete') return { title: `eliminó el partido ${score(b)} de ${name(b.referee_id)}`, detail: `−${s(b.target_km)} km de objetivo` };
      const changes: string[] = [];
      if (score(a) !== score(b)) changes.push(`${score(b)} → ${score(a)} (${s(b.target_km)} → ${s(a.target_km)} km)`);
      if (a.match_date !== b.match_date) changes.push(`fecha ${formatShortDate(s(b.match_date))} → ${formatShortDate(s(a.match_date))}`);
      for (const [k, label] of [['yellow_cards', 'amarillas'], ['blue_cards', 'azules'], ['red_cards', 'rojas']] as const) {
        if (b[k] !== undefined && a[k] !== b[k]) changes.push(`${label} ${s(b[k])} → ${s(a[k])}`);
      }
      if (a.referee_id !== b.referee_id) changes.push(`árbitro ${name(b.referee_id)} → ${name(a.referee_id)}`);
      return { title: `corrigió el partido de ${name(a.referee_id)}`, detail: [changes.join(' · '), ev.reason && `Motivo: ${ev.reason}`].filter(Boolean).join(' — ') };
    }
    case 'workouts': {
      const km = `${formatKm(n(row.distance_km), true)} km`;
      const what = `${ACTIVITY_LABELS[row.activity_type as ActivityType]?.toLowerCase() ?? 'entrenamiento'} de ${km} (${formatShortDate(s(row.activity_date))})`;
      if (ev.action === 'insert') return { title: `registró ${what}`, detail: row.validation_status === 'pending' ? 'Pendiente de revisión' : undefined };
      if (ev.action === 'delete') return { title: `eliminó ${what}` };
      if (a.validation_status !== b.validation_status && n(a.distance_km) === n(b.distance_km)) {
        const verb = a.validation_status === 'confirmed' ? 'validó' : a.validation_status === 'rejected' ? 'rechazó' : 'marcó como pendiente';
        return { title: `${verb} ${what} de ${name(a.user_id)}`, detail: s(a.review_note) || undefined };
      }
      const changes: string[] = [];
      if (n(a.distance_km) !== n(b.distance_km)) changes.push(`${formatKm(n(b.distance_km), true)} → ${formatKm(n(a.distance_km), true)} km`);
      if (a.activity_date !== b.activity_date) changes.push(`fecha ${formatShortDate(s(b.activity_date))} → ${formatShortDate(s(a.activity_date))}`);
      if (a.duration_s !== b.duration_s) changes.push('duración');
      if (a.activity_type !== b.activity_type) changes.push('tipo de actividad');
      return { title: `editó ${what}`, detail: changes.join(' · ') || undefined };
    }
    case 'seasons': {
      if (ev.action === 'insert') return { title: `creó la temporada «${s(a.name)}»` };
      if (ev.action === 'delete') return { title: `eliminó la temporada «${s(b.name)}»` };
      const changes: string[] = [];
      if (a.status !== b.status) changes.push(`estado: ${SEASON_STATUS_LABELS[a.status as SeasonStatus]}`);
      if (a.compliance_policy !== b.compliance_policy) changes.push(`metodología: ${POLICY_LABELS[a.compliance_policy as CompliancePolicy]}`);
      if (a.start_date !== b.start_date || a.end_date !== b.end_date) changes.push('fechas');
      if (JSON.stringify(a.counted_activity_types) !== JSON.stringify(b.counted_activity_types)) changes.push('actividades que computan');
      if (a.manual_requires_review !== b.manual_requires_review) changes.push('revisión de registros manuales');
      if (a.name !== b.name) changes.push('nombre');
      return { title: `modificó la temporada «${s(a.name)}»`, detail: changes.join(' · ') || undefined };
    }
    case 'group_members': {
      if (ev.action === 'insert') return { title: `${name(a.user_id)} se unió al grupo`, detail: ROLE_LABELS[a.role as MemberRole] };
      if (a.status !== b.status) return { title: `${a.status === 'inactive' ? 'desactivó' : 'reactivó'} a ${name(a.user_id)}` };
      if (a.role !== b.role) return { title: `cambió el rol de ${name(a.user_id)} a ${ROLE_LABELS[a.role as MemberRole].toLowerCase()}` };
      return { title: `actualizó a ${name(a.user_id)}` };
    }
    case 'invitations':
      if (ev.action === 'insert') return { title: 'creó una invitación', detail: `${s(a.max_uses)} uso(s) · ${ROLE_LABELS[a.role as MemberRole]}` };
      if (a.revoked_at && !b.revoked_at) return { title: 'revocó una invitación' };
      return { title: 'se usó una invitación' };
    case 'groups':
      if (ev.action === 'insert') return { title: `creó el grupo «${s(a.name)}»` };
      return { title: 'modificó los datos del grupo', detail: a.name !== b.name ? `Nombre: ${s(a.name)}` : a.timezone !== b.timezone ? `Zona horaria: ${s(a.timezone)}` : undefined };
    default:
      return { title: `${ev.action} en ${ev.entity_type}` };
  }
}

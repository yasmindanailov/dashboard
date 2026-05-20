/**
 * suspension-reason — Sprint 15C.II Fase F.12 (layout canónico).
 *
 * Helpers compartidos para parsear `service.suspension_reason` (cadena
 * combinada `"<reason>"` o `"<reason>: <internal_note>"` — ADR-077 Amendment
 * A4 + Fase F.6.2). Antes vivían DUPLICADOS en
 * `/dashboard/services/[id]/page.tsx` (`parseSuspensionReasonCode`, cliente)
 * y `/admin/services/[id]/page.tsx` (`parseSuspensionReason`, admin). F.12.2
 * los deDRYfica aquí (cero cambio funcional — misma lógica, un solo sitio).
 *
 * Diferencia canónica por rol (UI_SPEC §1.2 P5 + §4.13):
 *   - Cliente: solo ve la etiqueta localizada del enum (`service.suspension_reason.<code>`).
 *     NUNCA la nota interna del admin. → `parseSuspensionReasonCode`.
 *   - Admin: ve la etiqueta + la nota interna libre. → `parseSuspensionReason`.
 */
import { t } from '../i18n';
import type { SuspensionReason } from '../../lib/api';

const KNOWN_SUSPENSION_REASON_CODES = new Set<SuspensionReason>([
  'overdue_payment',
  'abuse_investigation',
  'scheduled_maintenance',
  'gdpr_restriction',
  'other',
]);

/**
 * Cliente — extrae SOLO el código `SuspensionReason` canónico. Si la parte
 * previa al `": "` no es un código conocido (forma legacy / motivo libre),
 * devuelve `'other'` (etiqueta genérica + CTA a soporte). El cliente NUNCA
 * ve la nota interna.
 */
export function parseSuspensionReasonCode(raw: string | null): SuspensionReason {
  if (!raw) return 'other';
  const sep = raw.indexOf(': ');
  const prefix = (sep >= 0 ? raw.slice(0, sep) : raw).trim();
  return KNOWN_SUSPENSION_REASON_CODES.has(prefix as SuspensionReason)
    ? (prefix as SuspensionReason)
    : 'other';
}

/**
 * Admin — parsea la cadena en su etiqueta localizada + la nota interna. Dos
 * formas posibles:
 *   - Canónica (`suspendAsAdmin`): `"<code>"` o `"<code>: <internal_note>"`
 *     → etiqueta `service.suspension_reason.<code>` + (si hay) nota.
 *   - Legacy (`autoSuspendServices` impago): texto libre tipo
 *     `"Impago — Factura INV-123"` → se muestra tal cual (ya es informativo),
 *     sin nota separada.
 */
export function parseSuspensionReason(raw: string | null): {
  label: string;
  note: string | null;
} {
  if (!raw) return { label: t('service.suspension_reason.other'), note: null };
  const sep = raw.indexOf(': ');
  const prefix = (sep >= 0 ? raw.slice(0, sep) : raw).trim();
  const note = sep >= 0 ? raw.slice(sep + 2).trim() : '';
  if (KNOWN_SUSPENSION_REASON_CODES.has(prefix as SuspensionReason)) {
    return {
      label: t(`service.suspension_reason.${prefix}`),
      note: note.length > 0 ? note : null,
    };
  }
  // Forma legacy / motivo no canónico: el `suspension_reason` completo ya es
  // legible — se muestra tal cual, sin nota separada.
  return { label: raw, note: null };
}

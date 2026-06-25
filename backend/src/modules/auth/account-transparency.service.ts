import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';

/* ═══════════════════════════════════════════════════════════════════════════
   AccountTransparencyService — backend del portal de transparencia RGPD
   (ADR-010 §Portal, audit 2026-06-25 GL-5 / H3b.1).

   Dos responsabilidades self-service del titular de los datos:
     1. `exportForUser` — portabilidad: ensambla TODOS los datos personales del
        usuario en un objeto JSON descargable (RGPD Art. 15/20). Self-scoped por
        el `userId` del JWT, nunca por parámetro (sin IDOR).
     2. `getSubprocessors` — transparencia: la lista de subprocesadores (terceros
        que reciben datos), leída de `settings.legal.subprocessors` con la lista
        canónica de ADR-010 §"Subprocesadores" como fallback.

   El export EXCLUYE explícitamente, vía `select` campo a campo:
     - Credenciales / secretos: `password_hash`, `two_factor_secret`, hashes de
       sesión/verificación/reset, `payment_ref`, `guest_session_hash`.
     - Notas internas de staff: `ClientProfile.notes_internal`, mensajes de
       soporte `is_internal=true`, `client_notes` (íntegramente).
     - Mapeos operacionales opacos (handles RC/Enhance, ids subrogados) y estado
       de seguridad/reintentos sin valor para el titular.

   Las `Decimal` de Prisma se serializan como string vía JSON.stringify (el pipe
   de Nest); es el comportamiento correcto para un export.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Un subprocesador (tercero que recibe datos personales). ADR-010 §Subproc. */
export interface SubprocessorEntry {
  name: string;
  purpose: string;
  location: string;
  dpa_url: string;
}

/**
 * Lista canónica por defecto (ADR-010 §"Subprocesadores"). Solo los terceros
 * que HOY procesan datos del cliente en pre-producción: ResellerClub (dominios)
 * y Enhance CP (hosting). Stripe (pagos), Sentry (observabilidad) y Anthropic
 * (IA) se añadirán cuando se activen — MinIO es storage propio de Aelium
 * (técnicamente no es subprocesador externo). Editable por el superadmin vía el
 * setting `legal.subprocessors` (UI de edición = follow-up).
 */
export const DEFAULT_SUBPROCESSORS: readonly SubprocessorEntry[] = [
  {
    name: 'ResellerClub (Endurance/Newfold)',
    purpose: 'Registro y gestión de dominios',
    location: 'India / EE. UU.',
    dpa_url: 'https://www.resellerclub.com/legal/privacy-policy',
  },
  {
    name: 'Enhance CP',
    purpose: 'Aprovisionamiento y gestión del hosting',
    location: 'UE',
    dpa_url: 'https://enhance.com/privacy',
  },
];

@Injectable()
export class AccountTransparencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Lista de subprocesadores mostrada en el portal de transparencia. Lee el
   * setting `legal.subprocessors`; si no existe, devuelve la lista canónica.
   */
  async getSubprocessors(): Promise<SubprocessorEntry[]> {
    return this.settings.getJson<SubprocessorEntry[]>(
      'legal',
      'subprocessors',
      [...DEFAULT_SUBPROCESSORS],
    );
  }

  /**
   * Reúne el export completo del usuario `userId`. Devuelve un objeto plano
   * listo para serializar a JSON. Self-scoped (el caller deriva `userId` del JWT).
   */
  async exportForUser(userId: string, generatedAt: Date): Promise<DataExport> {
    const [
      account,
      clientProfile,
      billingProfiles,
      services,
      invoices,
      conversations,
      notifications,
      accessLog,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          status: true,
          language: true,
          timezone: true,
          two_factor_enabled: true,
          email_verified_at: true,
          last_login_at: true,
          created_at: true,
          updated_at: true,
          role: { select: { slug: true, name: true } },
        },
      }),
      this.prisma.clientProfile.findUnique({
        where: { user_id: userId },
        select: {
          client_type: true,
          company_name: true,
          tax_id: true,
          phone: true,
          address_line1: true,
          address_line2: true,
          city: true,
          state: true,
          postal_code: true,
          country: true,
          billing_email: true,
          stripe_customer_id: true,
          credit_balance: true,
          created_at: true,
          updated_at: true,
        },
      }),
      this.prisma.billingProfile.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'asc' },
        select: {
          type: true,
          label: true,
          first_name: true,
          last_name: true,
          company_name: true,
          nif_cif: true,
          address_line1: true,
          address_line2: true,
          city: true,
          postal_code: true,
          country: true,
          is_default: true,
          is_archived: true,
          archived_at: true,
          created_at: true,
          updated_at: true,
        },
      }),
      this.prisma.service.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'asc' },
        select: {
          label: true,
          domain: true,
          status: true,
          billing_cycle: true,
          amount: true,
          currency: true,
          next_due_date: true,
          next_invoice_date: true,
          expires_at: true,
          cancelled_at: true,
          cancellation_reason: true,
          suspended_at: true,
          suspension_reason: true,
          provisioner_slug: true,
          created_at: true,
          updated_at: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'asc' },
        select: {
          invoice_number: true,
          status: true,
          subtotal: true,
          tax_rate: true,
          tax_amount: true,
          discount_amount: true,
          total: true,
          currency: true,
          due_date: true,
          paid_at: true,
          payment_provider: true,
          payment_method: true,
          notes: true,
          pdf_url: true,
          created_at: true,
          items: {
            select: {
              description: true,
              quantity: true,
              unit_price: true,
              setup_fee: true,
              discount_pct: true,
              total: true,
              period_start: true,
              period_end: true,
            },
          },
        },
      }),
      this.prisma.conversation.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'asc' },
        select: {
          subject: true,
          type: true,
          status: true,
          priority: true,
          category: true,
          channel: true,
          resolution_note: true,
          closed_at: true,
          resolved_at: true,
          created_at: true,
          // Solo mensajes visibles para el cliente — las notas internas del
          // staff (`is_internal=true`) NO se incluyen.
          messages: {
            where: { is_internal: false },
            orderBy: { created_at: 'asc' },
            select: {
              sender_type: true,
              body: true,
              attachments: true,
              created_at: true,
            },
          },
        },
      }),
      this.prisma.notification.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        select: {
          channel: true,
          title: true,
          body: true,
          action_url: true,
          read_at: true,
          sent_at: true,
          created_at: true,
        },
      }),
      this.prisma.auditAccessLog.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        select: {
          action: true,
          ip_address: true,
          user_agent: true,
          resource: true,
          metadata: true,
          created_at: true,
        },
      }),
    ]);

    return {
      export_generated_at: generatedAt.toISOString(),
      user_id: userId,
      account,
      client_profile: clientProfile,
      billing_profiles: billingProfiles,
      services,
      invoices,
      support_conversations: conversations,
      notifications,
      access_log: accessLog,
    };
  }
}

/**
 * Shape del export. Los sub-objetos quedan como `unknown` para no acoplar el
 * contrato público a los tipos generados de Prisma — la forma real la fija el
 * `select` de arriba.
 */
export interface DataExport {
  export_generated_at: string;
  user_id: string;
  account: unknown;
  client_profile: unknown;
  billing_profiles: unknown[];
  services: unknown[];
  invoices: unknown[];
  support_conversations: unknown[];
  notifications: unknown[];
  access_log: unknown[];
}

import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../audit/audit.service';

/* ═══════════════════════════════════════════════════════════════════════════
   AccountDeletionService — derecho al olvido RGPD (Art. 17, ADR-010 §Portal,
   audit 2026-06-25 GL-5 / H3b.2).

   Flujo (decisión Yasmin): el titular SOLICITA el borrado; un admin lo REVISA y
   EJECUTA. La ejecución comprueba que no haya servicios vivos ni facturas
   impagadas (el admin debe resolverlos antes) y entonces SOFT-DELETE +
   ANONIMIZA — NUNCA borrado físico, porque hay obligación legal de retener
   facturas 10 años (Hacienda RD 1619/2012) y audit 2 años (AEPD). El usuario
   pasa a `status=inactive` (el login ya lo bloquea) + PII borrada +
   `anonymized_at`.

   Lo que se anonimiza: identidad de cuenta (`User`) + perfil de cliente
   (`ClientProfile`). Lo que se RETIENE por obligación legal: facturas + perfiles
   de facturación (snapshot fiscal) + logs de auditoría (hasta su retención).
   ═══════════════════════════════════════════════════════════════════════════ */

/** Servicios "vivos" que bloquean el borrado (no cancelados/terminados). */
const LIVE_SERVICE_STATUSES = [
  'pending',
  'provisioning',
  'active',
  'suspended',
] as const;

/** Facturas impagadas que bloquean el borrado. */
const UNPAID_INVOICE_STATUSES = ['pending', 'overdue'] as const;

export interface DeletionBlockers {
  active_services: number;
  unpaid_invoices: number;
}

@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* ─────────────────────────── Cliente (self-service) ─────────────────────── */

  /**
   * El titular solicita el borrado de su cuenta. Idempotente-defensivo: si ya
   * hay una solicitud `pending` la devuelve; si la cuenta ya está anonimizada,
   * 409.
   */
  async requestDeletion(userId: string, reason?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, anonymized_at: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (user.anonymized_at) {
      throw new ConflictException('La cuenta ya está anonimizada.');
    }

    const existing = await this.prisma.accountDeletionRequest.findFirst({
      where: { user_id: userId, status: 'pending' },
    });
    if (existing) return existing;

    return this.prisma.accountDeletionRequest.create({
      data: {
        user_id: userId,
        reason: reason?.trim() || null,
        status: 'pending',
      },
    });
  }

  /** El titular cancela su solicitud `pending`. */
  async cancelMyRequest(userId: string) {
    const pending = await this.prisma.accountDeletionRequest.findFirst({
      where: { user_id: userId, status: 'pending' },
    });
    if (!pending) {
      throw new NotFoundException('No tienes ninguna solicitud pendiente.');
    }
    return this.prisma.accountDeletionRequest.update({
      where: { id: pending.id },
      data: { status: 'cancelled' },
    });
  }

  /** Estado de la solicitud más reciente del titular (o `null`). */
  async getMyRequest(userId: string) {
    return this.prisma.accountDeletionRequest.findFirst({
      where: { user_id: userId },
      orderBy: { requested_at: 'desc' },
      select: {
        id: true,
        status: true,
        reason: true,
        requested_at: true,
        reviewed_at: true,
        review_note: true,
        completed_at: true,
      },
    });
  }

  /* ──────────────────────────────── Admin ─────────────────────────────────── */

  /**
   * Lista de solicitudes (default `pending`) con los datos del titular y los
   * bloqueadores (servicios vivos / facturas impagadas) para que el admin
   * decida. Self-contained: una query de solicitudes + counts agregados.
   */
  async listRequests(status?: string) {
    const requests = await this.prisma.accountDeletionRequest.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { requested_at: 'asc' },
      select: {
        id: true,
        user_id: true,
        status: true,
        reason: true,
        requested_at: true,
        reviewed_at: true,
        review_note: true,
        completed_at: true,
        user: {
          select: {
            email: true,
            first_name: true,
            last_name: true,
            status: true,
            anonymized_at: true,
          },
        },
      },
    });

    return Promise.all(
      requests.map(async (r) => ({
        ...r,
        blockers: await this.computeBlockers(r.user_id),
      })),
    );
  }

  /** Rechaza una solicitud `pending` con una nota. */
  async rejectRequest(requestId: string, adminId: string, note: string) {
    const request = await this.loadPending(requestId);
    const updated = await this.prisma.accountDeletionRequest.update({
      where: { id: request.id },
      data: {
        status: 'rejected',
        reviewed_at: new Date(),
        reviewed_by_id: adminId,
        review_note: note.trim() || null,
      },
    });
    await this.audit.logChange({
      user_id: adminId,
      entity_type: 'AccountDeletionRequest',
      entity_id: request.id,
      action: 'deletion_request_rejected',
      changes_after: { status: 'rejected', target_user_id: request.user_id },
    });
    return updated;
  }

  /**
   * Ejecuta el borrado: valida que no haya servicios vivos ni facturas
   * impagadas, y entonces anonimiza (User + ClientProfile + revoca sesiones) en
   * una `$transaction`, marcando la solicitud `completed`. Audita R3.
   */
  async executeRequest(requestId: string, adminId: string) {
    const request = await this.loadPending(requestId);

    const user = await this.prisma.user.findUnique({
      where: { id: request.user_id },
      select: { id: true, anonymized_at: true },
    });
    if (!user) throw new NotFoundException('El titular ya no existe.');
    if (user.anonymized_at) {
      throw new ConflictException('La cuenta ya estaba anonimizada.');
    }

    const blockers = await this.computeBlockers(request.user_id);
    if (blockers.active_services > 0 || blockers.unpaid_invoices > 0) {
      throw new ConflictException(
        `No se puede borrar: ${blockers.active_services} servicio(s) vivo(s) y ` +
          `${blockers.unpaid_invoices} factura(s) impagada(s). Resuélvelos primero.`,
      );
    }

    const now = new Date();
    const anonEmail = `deleted-${request.user_id}@anonymized.invalid`;

    await this.prisma.$transaction(async (tx) => {
      // 1) Identidad de cuenta. `status=inactive` bloquea el login; el
      // password se invalida (no es un hash bcrypt válido) y los secretos 2FA
      // se borran. `email`/nombres se reemplazan por marcadores no-PII.
      await tx.user.update({
        where: { id: request.user_id },
        data: {
          email: anonEmail,
          first_name: 'Cuenta',
          last_name: 'eliminada',
          password_hash: 'ANONYMIZED',
          two_factor_enabled: false,
          two_factor_secret: null,
          avatar_url: null,
          last_login_ip: null,
          status: 'inactive',
          anonymized_at: now,
        },
      });

      // 2) Perfil de cliente (WHOIS/contacto): borra la PII. `country` es NOT
      // NULL (se deja); `credit_balance` es contable (se deja).
      await tx.clientProfile.updateMany({
        where: { user_id: request.user_id },
        data: {
          company_name: null,
          tax_id: null,
          phone: null,
          address_line1: null,
          address_line2: null,
          city: null,
          state: null,
          postal_code: null,
          billing_email: null,
          stripe_customer_id: null,
          notes_internal: null,
        },
      });

      // 3) Revoca todas las sesiones activas.
      await tx.session.updateMany({
        where: { user_id: request.user_id, is_active: true },
        data: { is_active: false, revoked_reason: 'account_anonymized' },
      });

      // 4) Cierra la solicitud.
      await tx.accountDeletionRequest.update({
        where: { id: request.id },
        data: {
          status: 'completed',
          reviewed_at: now,
          reviewed_by_id: adminId,
          completed_at: now,
        },
      });
    });

    // R3 (fuera de la tx, fail-soft): registro inmutable de la anonimización.
    // Las facturas y los perfiles de facturación se RETIENEN por obligación
    // legal (snapshot fiscal 10 años); el audit, hasta su retención (2 años).
    await this.audit.logChange({
      user_id: adminId,
      entity_type: 'User',
      entity_id: request.user_id,
      action: 'account_anonymized',
      changes_after: {
        anonymized_at: now.toISOString(),
        deletion_request_id: request.id,
        retained: 'invoices(10y) + billing_profiles + audit(2y)',
      },
    });

    this.logger.warn(
      `Cuenta ${request.user_id} anonimizada (solicitud ${request.id}, admin ${adminId}).`,
    );

    return { ok: true, anonymized_at: now.toISOString() };
  }

  /* ─────────────────────────────── Privados ───────────────────────────────── */

  private async loadPending(requestId: string) {
    const request = await this.prisma.accountDeletionRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Solicitud no encontrada.');
    if (request.status !== 'pending') {
      throw new ConflictException(
        `La solicitud ya está "${request.status}"; solo se pueden revisar las pendientes.`,
      );
    }
    return request;
  }

  private async computeBlockers(userId: string): Promise<DeletionBlockers> {
    const [active_services, unpaid_invoices] = await Promise.all([
      this.prisma.service.count({
        where: { user_id: userId, status: { in: [...LIVE_SERVICE_STATUSES] } },
      }),
      this.prisma.invoice.count({
        where: {
          user_id: userId,
          status: { in: [...UNPAID_INVOICE_STATUSES] },
        },
      }),
    ]);
    return { active_services, unpaid_invoices };
  }
}

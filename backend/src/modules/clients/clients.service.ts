import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma, RoleSlug } from '@prisma/client';
import { paginate, PaginatedResult } from '../../common/dto/pagination.dto';
import {
  ClientListQueryDto,
  UpdateClientProfileDto,
  AddNoteDto,
  CreateExceptionalNoteDto,
  ClientNoteQueryDto,
} from './dto/client.dto';
import {
  CreateBillingProfileDto,
  UpdateBillingProfileDto,
} from './dto/billing-profile.dto';
import { ClientsBillingService } from './clients-billing.service';
import { ClientNotesService } from './client-notes.service';
import { AuditService } from '../audit/audit.service';

/* ═══════════════════════════════════════
   ClientsService — Client CRUD, notes,
   and billing profile facade.
   Ref: ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: ClientsBillingService,
    private readonly notes: ClientNotesService,
    private readonly audit: AuditService,
  ) {}

  /* ── List ── */

  async findAll(query: ClientListQueryDto): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      assigned_technician,
      client_type,
    } = query;
    const skip = (page - 1) * limit;

    const clientRole = await this.prisma.role.findUnique({
      where: { slug: RoleSlug.client },
    });
    if (!clientRole) throw new Error('Client role not found');

    const where: Prisma.UserWhereInput = { role_id: clientRole.id };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { first_name: { contains: search, mode: 'insensitive' } },
        { last_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    // F3·E8 — "Mis clientes" / por técnico: clientes cuya suscripción SI ACTIVA
    // tiene a este técnico asignado. `'me'` ya viene resuelto desde el controller.
    if (assigned_technician) {
      where.support_inside_subscription = {
        is: { status: 'active', assigned_technician_id: assigned_technician },
      };
    }
    // F4·U21 — filtro por tipo de cliente (perfil fiscal: individual/company).
    if (client_type) {
      where.client_profile = { is: { client_type } };
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          status: true,
          last_login_at: true,
          created_at: true,
          client_profile: {
            select: { client_type: true, phone: true, company_name: true },
          },
          // F3·E8 — técnico asignado (si tiene SI activo) para mostrarlo en la
          // lista cuando se filtra por técnico. null si no tiene plan SI.
          support_inside_subscription: {
            select: {
              status: true,
              technician: { select: { first_name: true, last_name: true } },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  /* ── Detail ── */

  async findOne(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        status: true,
        email_verified_at: true,
        last_login_at: true,
        last_login_ip: true,
        two_factor_enabled: true,
        language: true,
        timezone: true,
        created_at: true,
        role: { select: { slug: true, name: true } },
        client_profile: true,
        billing_profiles: { orderBy: { created_at: 'desc' } },
        // Sub-fase 8.D.12.4: enriquecimiento canónico Support Inside.
        // Se incluye SIEMPRE en la respuesta admin del cliente para que
        // header / sidebar / acciones puedan renderizar el badge "tier
        // de cuenta" sin N+1 queries adicionales (ADR-061 §"visible").
        // El campo es null si el cliente no tiene subscription activa o
        // cancelled — el frontend decide qué renderizar.
        support_inside_subscription: {
          select: {
            id: true,
            status: true,
            started_at: true,
            cancelled_at: true,
            product: {
              select: {
                slug: true,
                name: true,
                support_inside_config: {
                  select: {
                    priority_tier: true,
                    response_sla_hours: true,
                    channels_active: true,
                    slots_included: true,
                  },
                },
              },
            },
            slots: {
              where: { released_at: null },
              select: {
                id: true,
                service_id: true,
                slot_type: true,
                is_extra: true,
                anniversary_day: true,
              },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('Cliente no encontrado');
    if (user.role.slug !== RoleSlug.client)
      throw new NotFoundException('Cliente no encontrado');
    return user;
  }

  /* ── Update Profile ── */

  async updateProfile(userId: string, dto: UpdateClientProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: { select: { slug: true } } },
    });
    if (!user) throw new NotFoundException('Cliente no encontrado');
    if (user.role.slug !== RoleSlug.client)
      throw new NotFoundException('Cliente no encontrado');

    return this.prisma.clientProfile.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...dto },
      update: dto,
    });
  }

  /* ── Estado de la cuenta (suspender / reactivar) ── */

  /**
   * F4·U22 — suspende (`status=blocked`) o reactiva (`status=active`) la CUENTA
   * del cliente: bloquea/permite el login. **NO cascada a los servicios** (se
   * suspenden por separado en `/admin/services`). Idempotente y auditado (R3:
   * `audit_change_log`, `entity_type='User'`). Solo aplica a usuarios cliente.
   */
  async setAccountSuspended(
    userId: string,
    suspended: boolean,
    adminId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, role: { select: { slug: true } } },
    });
    if (!user || user.role.slug !== RoleSlug.client)
      throw new NotFoundException('Cliente no encontrado');

    const nextStatus: 'blocked' | 'active' = suspended ? 'blocked' : 'active';
    if (user.status === nextStatus) {
      return { id: user.id, status: user.status };
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: nextStatus },
      select: { id: true, status: true },
    });

    await this.audit.logChange({
      user_id: adminId,
      entity_type: 'User',
      entity_id: userId,
      action: suspended
        ? 'client.account_suspended'
        : 'client.account_reactivated',
      changes_before: { status: user.status },
      changes_after: { status: nextStatus },
    });

    return updated;
  }

  /* ── Legacy text-blob note ──
     Sprint 16 (ADR-079): el campo `client_profiles.notes_internal` sigue
     existiendo como blob histórico. La nota estructurada paralela ahora va
     al canal canónico `client_notes` con `source_system='exceptional'`. */
  async addNote(userId: string, dto: AddNoteDto, authorId?: string) {
    const profile = await this.prisma.clientProfile.findUnique({
      where: { user_id: userId },
    });
    if (!profile)
      throw new NotFoundException('Perfil de cliente no encontrado');

    const timestamp = new Date().toISOString();
    const newNote = `[${timestamp}]\n${dto.note}`;
    const existingNotes = profile.notes_internal || '';
    const updatedNotes = existingNotes
      ? `${newNote}\n\n---\n\n${existingNotes}`
      : newNote;

    const result = await this.prisma.clientProfile.update({
      where: { user_id: userId },
      data: { notes_internal: updatedNotes },
    });

    if (authorId) {
      try {
        await this.notes.createExceptional(userId, authorId, {
          body: dto.note,
          is_pinned: false,
        });
      } catch (e) {
        console.warn('[ClientsService] structured note sync failed:', e);
      }
    }

    return result;
  }

  /* ── Structured notes — delegan en ClientNotesService canónico ── */

  async createExceptionalNote(
    userId: string,
    authorId: string,
    dto: CreateExceptionalNoteDto,
  ) {
    return this.notes.createExceptional(userId, authorId, dto);
  }

  async listStructuredNotes(userId: string, query: ClientNoteQueryDto) {
    return this.notes.findByClient(userId, query);
  }

  async toggleNotePin(noteId: string) {
    return this.notes.togglePin(noteId);
  }

  /* ── Sprint 16 (ADR-079 §2): helper canónico para detectar primer servicio.
     Usado por `ClientLifecycleTaskCreatorListener` para decidir si emite
     una task `client_lifecycle` (bienvenida) cuando un servicio se activa.
     Devuelve `true` si el cliente solo tiene UN service en estados activos
     (active|provisioning|pending) — es decir, el que acaba de activar es
     su primer servicio. ── */
  async isFirstService(clientId: string, serviceId: string): Promise<boolean> {
    const count = await this.prisma.service.count({
      where: {
        user_id: clientId,
        id: { not: serviceId },
      },
    });
    return count === 0;
  }

  /* ── Billing Profile delegates ── */

  getBillingProfiles(userId: string) {
    return this.billing.getBillingProfiles(userId);
  }
  createBillingProfile(userId: string, dto: CreateBillingProfileDto) {
    return this.billing.createBillingProfile(userId, dto);
  }
  updateBillingProfile(
    userId: string,
    profileId: string,
    dto: UpdateBillingProfileDto,
  ) {
    return this.billing.updateBillingProfile(userId, profileId, dto);
  }
  deleteBillingProfile(userId: string, profileId: string) {
    return this.billing.deleteBillingProfile(userId, profileId);
  }
  setDefaultBillingProfile(userId: string, profileId: string) {
    return this.billing.setDefaultBillingProfile(userId, profileId);
  }
}

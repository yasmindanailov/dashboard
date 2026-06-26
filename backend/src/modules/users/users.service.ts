import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleSlug, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginate, PaginatedResult } from '../../common/dto/pagination.dto';
import {
  AgentListQueryDto,
  ASSIGNABLE_ROLE_SLUGS,
  AssignableRoleSlug,
} from './dto/agent-list-query.dto';
import {
  CreateStaffDto,
  MANAGEABLE_STAFF_ROLES,
  SettableStaffStatus,
  StaffListQueryDto,
  UpdateStaffDto,
} from './dto/staff.dto';

/**
 * UsersService — operaciones sobre cuentas staff (no clientes ni partners).
 *
 * Sprint 8 Fase A (2026-04-29): primer endpoint público es `findAgents`,
 * consumido por `NewTaskModal` (Sprint 8 Fase B) para resolver el selector
 * de asignación de tareas. La lista coincide con la doctrina de
 * `tasks.service.ts:assertAssignableUser` (Sprint 8 P0.1): rol staff +
 * `status=active`. Si una de las dos validaciones cambia, hay que
 * actualizarlas en paralelo (las dos comparten la constante
 * `ASSIGNABLE_ROLE_SLUGS` de `dto/agent-list-query.dto.ts`).
 *
 * GL-21 (audit 2026-06-25 §6 Tier 3): gestión completa de cuentas staff
 * (alta/baja/rol) — solo `superadmin` (CASL `Manage.Agent`). Antes, el alta y
 * la baja de un agente solo se podían hacer en BD → offboarding manual = riesgo
 * operativo y de seguridad. Invariantes de seguridad: auto-protección (nadie
 * cambia su propio rol ni se desactiva), último superadmin activo intocable,
 * baja = `inactive` + revocación de sesiones (el JWT deja de validar al instante,
 * jwt.strategy.ts), nunca borrado físico (R3/AUTH-INV-7 + integridad de FKs:
 * tasks, audit y sesiones referencian `user_id`). Todo cambio se audita (R3).
 */
export interface AgentListItemDto {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: RoleSlug;
  status: UserStatus;
  avatar_url: string | null;
}

/** Vista de gestión de una cuenta staff (sin secretos: ni hash ni 2FA secret). */
export interface StaffMemberDto {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: RoleSlug;
  status: UserStatus;
  two_factor_enabled: boolean;
  last_login_at: Date | null;
  created_at: Date;
  avatar_url: string | null;
}

const BCRYPT_ROUNDS = 12; // AUTH-INV-2 (mismo coste que register/account)

/** Proyección segura compartida (nunca incluye `password_hash`/`two_factor_secret`). */
const STAFF_SELECT = {
  id: true,
  email: true,
  first_name: true,
  last_name: true,
  status: true,
  two_factor_enabled: true,
  last_login_at: true,
  created_at: true,
  avatar_url: true,
  anonymized_at: true,
  role: { select: { slug: true } },
} satisfies Prisma.UserSelect;

type StaffRow = Prisma.UserGetPayload<{ select: typeof STAFF_SELECT }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Lista usuarios staff ("agentes asignables"). Filtra siempre por roles
   * en `ASSIGNABLE_ROLE_SLUGS`; si el query pasa `role=...` lo intersecta
   * con el set permitido (defense-in-depth contra inyectar roles arbitrarios).
   */
  async findAgents(
    query: AgentListQueryDto,
  ): Promise<PaginatedResult<AgentListItemDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const status = query.status ?? UserStatus.active;
    const skip = (page - 1) * limit;

    const requestedRoles: AssignableRoleSlug[] =
      query.role && query.role.length > 0
        ? query.role.filter((slug) =>
            (ASSIGNABLE_ROLE_SLUGS as readonly RoleSlug[]).includes(slug),
          )
        : Array.from(ASSIGNABLE_ROLE_SLUGS);

    if (requestedRoles.length === 0) {
      return paginate<AgentListItemDto>([], 0, page, limit);
    }

    const where: Prisma.UserWhereInput = {
      status,
      role: { slug: { in: requestedRoles } },
    };

    if (query.search) {
      where.OR = [
        { first_name: { contains: query.search, mode: 'insensitive' } },
        { last_name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          status: true,
          avatar_url: true,
          role: { select: { slug: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const data: AgentListItemDto[] = rows.map((row) => ({
      id: row.id,
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      full_name: `${row.first_name} ${row.last_name}`.trim(),
      role: row.role.slug,
      status: row.status,
      avatar_url: row.avatar_url,
    }));

    return paginate(data, total, page, limit);
  }

  /* ───────────────────────── Gestión de staff (GL-21) ─────────────────────── */

  /** Listado de gestión: todos los roles staff y, por defecto, todos los estados. */
  async listStaff(
    query: StaffListQueryDto,
  ): Promise<PaginatedResult<StaffMemberDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const requestedRoles: RoleSlug[] =
      query.role && query.role.length > 0
        ? query.role.filter((slug) =>
            (MANAGEABLE_STAFF_ROLES as readonly RoleSlug[]).includes(slug),
          )
        : [...MANAGEABLE_STAFF_ROLES];

    if (requestedRoles.length === 0) {
      return paginate<StaffMemberDto>([], 0, page, limit);
    }

    const where: Prisma.UserWhereInput = {
      role: { slug: { in: requestedRoles } },
    };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { first_name: { contains: query.search, mode: 'insensitive' } },
        { last_name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ created_at: 'desc' }],
        select: STAFF_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(
      rows.map((row) => this.toStaffMember(row)),
      total,
      page,
      limit,
    );
  }

  /** Detalle de una cuenta staff (404 si el id no es una cuenta staff). */
  async getStaff(id: string): Promise<StaffMemberDto> {
    return this.toStaffMember(await this.loadStaffOrThrow(id));
  }

  /**
   * Alta de una cuenta staff. El admin avala al agente: cuenta `active` con
   * email verificado (mismo patrón que el seed de staff). El reto 2FA en login
   * es automático para roles staff (AUTH-INV-3, 2FA por email) — no requiere
   * setup previo. La contraseña inicial la fija el admin y el agente la cambia
   * desde su cuenta (out-of-band; el flujo de invitación por email queda como
   * mejora futura, acoplado a SMTP real — GL-12).
   */
  async createStaff(
    dto: CreateStaffDto,
    adminId: string,
  ): Promise<StaffMemberDto> {
    const email = dto.email.toLowerCase().trim(); // AUTH-INV-1
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con este email.');
    }

    const roleRecord = await this.resolveStaffRole(dto.role);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS); // AUTH-INV-2

    const user = await this.prisma.user.create({
      data: {
        email,
        password_hash: passwordHash,
        first_name: dto.first_name.trim(),
        last_name: dto.last_name.trim(),
        status: UserStatus.active,
        email_verified_at: new Date(),
        role_id: roleRecord.id,
      },
      select: STAFF_SELECT,
    });

    await this.audit.logChange({
      user_id: adminId,
      entity_type: 'User',
      entity_id: user.id,
      action: 'staff_created',
      changes_after: { email, role: dto.role, status: UserStatus.active },
    });

    return this.toStaffMember(user);
  }

  /** Edita nombre y/o rol de una cuenta staff. */
  async updateStaff(
    id: string,
    dto: UpdateStaffDto,
    adminId: string,
  ): Promise<StaffMemberDto> {
    const target = await this.loadStaffOrThrow(id);

    const data: Prisma.UserUpdateInput = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    const firstName = dto.first_name?.trim();
    if (firstName !== undefined && firstName !== target.first_name) {
      before.first_name = target.first_name;
      data.first_name = firstName;
      after.first_name = firstName;
    }
    const lastName = dto.last_name?.trim();
    if (lastName !== undefined && lastName !== target.last_name) {
      before.last_name = target.last_name;
      data.last_name = lastName;
      after.last_name = lastName;
    }

    if (dto.role !== undefined && dto.role !== target.role.slug) {
      // Auto-protección: nadie cambia su propio rol (evita auto-bloqueo).
      if (id === adminId) {
        throw new ForbiddenException('No puedes cambiar tu propio rol.');
      }
      // Último superadmin activo: no degradarlo (dejaría el sistema sin raíz).
      await this.assertNotLastActiveSuperadmin(target);
      const roleRecord = await this.resolveStaffRole(dto.role);
      data.role = { connect: { id: roleRecord.id } };
      before.role = target.role.slug;
      after.role = dto.role;
    }

    if (Object.keys(data).length === 0) {
      return this.toStaffMember(target); // nada que cambiar
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: STAFF_SELECT,
    });

    await this.audit.logChange({
      user_id: adminId,
      entity_type: 'User',
      entity_id: id,
      action: 'staff_updated',
      changes_before: before,
      changes_after: after,
    });

    return this.toStaffMember(updated);
  }

  /**
   * Activa/desactiva una cuenta staff. La baja (`inactive`) es offboarding:
   * revoca TODAS las sesiones activas en la misma `$transaction` (el JWT deja de
   * validar al instante — jwt.strategy.ts rechaza `inactive`). Idempotente.
   */
  async setStaffStatus(
    id: string,
    status: SettableStaffStatus,
    adminId: string,
  ): Promise<StaffMemberDto> {
    const target = await this.loadStaffOrThrow(id);

    if (target.status === status) {
      return this.toStaffMember(target); // idempotente: sin audit espurio
    }

    if (status === UserStatus.inactive) {
      // Auto-protección + último superadmin activo.
      if (id === adminId) {
        throw new ForbiddenException('No puedes desactivar tu propia cuenta.');
      }
      await this.assertNotLastActiveSuperadmin(target);

      const revoked = await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: { status: UserStatus.inactive },
        });
        const res = await tx.session.updateMany({
          where: { user_id: id, is_active: true },
          data: { is_active: false, revoked_reason: 'staff_deactivated' },
        });
        return res.count;
      });

      await this.audit.logChange({
        user_id: adminId,
        entity_type: 'User',
        entity_id: id,
        action: 'staff_deactivated',
        changes_before: { status: target.status },
        changes_after: {
          status: UserStatus.inactive,
          sessions_revoked: revoked,
        },
      });
    } else {
      // Reactivación. Una cuenta anonimizada (RGPD) NUNCA se reactiva.
      if (target.anonymized_at) {
        throw new ConflictException(
          'La cuenta está anonimizada; no se puede reactivar.',
        );
      }
      await this.prisma.user.update({
        where: { id },
        data: { status: UserStatus.active },
      });
      await this.audit.logChange({
        user_id: adminId,
        entity_type: 'User',
        entity_id: id,
        action: 'staff_reactivated',
        changes_before: { status: target.status },
        changes_after: { status: UserStatus.active },
      });
    }

    return this.toStaffMember({ ...target, status });
  }

  /* ─────────────────────────────── Privados ───────────────────────────────── */

  /** Carga una cuenta y exige que sea staff (404 si no existe o no es staff). */
  private async loadStaffOrThrow(id: string): Promise<StaffRow> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: STAFF_SELECT,
    });
    if (
      !user ||
      !(MANAGEABLE_STAFF_ROLES as readonly RoleSlug[]).includes(user.role.slug)
    ) {
      throw new NotFoundException('Cuenta de staff no encontrada.');
    }
    return user;
  }

  private async resolveStaffRole(slug: RoleSlug): Promise<{ id: string }> {
    const role = await this.prisma.role.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!role) throw new NotFoundException(`Rol "${slug}" no existe.`);
    return role;
  }

  /**
   * Bloquea degradar/desactivar al ÚLTIMO superadmin activo. No-op si el target
   * no es un superadmin activo (degradar uno ya inactivo no afecta al censo).
   */
  private async assertNotLastActiveSuperadmin(target: StaffRow): Promise<void> {
    if (
      target.role.slug !== RoleSlug.superadmin ||
      target.status !== UserStatus.active
    ) {
      return;
    }
    const activeSuperadmins = await this.prisma.user.count({
      where: { role: { slug: RoleSlug.superadmin }, status: UserStatus.active },
    });
    if (activeSuperadmins <= 1) {
      throw new ForbiddenException(
        'No puedes degradar ni desactivar al último superadmin activo.',
      );
    }
  }

  private toStaffMember(row: StaffRow): StaffMemberDto {
    return {
      id: row.id,
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      full_name: `${row.first_name} ${row.last_name}`.trim(),
      role: row.role.slug,
      status: row.status,
      two_factor_enabled: row.two_factor_enabled,
      last_login_at: row.last_login_at,
      created_at: row.created_at,
      avatar_url: row.avatar_url,
    };
  }
}

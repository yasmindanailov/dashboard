import { Injectable } from '@nestjs/common';
import { Prisma, RoleSlug, UserStatus } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { paginate, PaginatedResult } from '../../common/dto/pagination.dto';
import {
  AgentListQueryDto,
  ASSIGNABLE_ROLE_SLUGS,
  AssignableRoleSlug,
} from './dto/agent-list-query.dto';

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

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
}

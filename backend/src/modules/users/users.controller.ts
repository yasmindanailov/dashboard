import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import { UsersService } from './users.service';
import { AgentListQueryDto } from './dto/agent-list-query.dto';

/**
 * UsersController — endpoints staff sobre cuentas internas (agentes).
 *
 * Sprint 8 Fase A (2026-04-29): único endpoint hoy es `GET /admin/users`,
 * usado por el `NewTaskModal` para listar agentes asignables a tareas
 * (consumido por Sprint 8 Fase B). El frontend NO accede directamente
 * a `users` desde el portal cliente — los selectores de agente son
 * exclusivamente del portal admin.
 *
 * Triple guard ([ADR-067 §4](docs/10-decisions/adr-067-granularidad-casl-rol-staff.md)):
 *   1. JwtAuthGuard — usuario autenticado.
 *   2. AdminOnlyGuard — corte temprano antes de CASL (sólo staff llega aquí).
 *   3. PoliciesGuard — CASL `Read.Agent` / `List.Agent` (superadmin +
 *      agent_full + agent_billing + agent_support; client/partner bloqueados).
 *
 * `Manage.Agent` queda explícitamente sólo para superadmin (creación/edición
 * de agentes — pendiente de implementación, no scope de Sprint 8).
 */
@ApiTags('Admin · Users')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.List, Subject.Agent))
  @ApiOperation({
    summary: 'Listar agentes asignables (staff)',
    description:
      'Retorna usuarios staff (superadmin/agent_full/agent_billing/agent_support) ' +
      'con `status=active` por defecto. Consumido por NewTaskModal y otros selectores ' +
      'de asignación. Filtros opcionales: `role[]`, `search`, `status`, `page`, `limit`.',
  })
  @ApiOkResponse({
    description: 'Lista paginada de agentes con shape `{ data, meta }`.',
  })
  async listAgents(@Query() query: AgentListQueryDto) {
    return this.usersService.findAgents(query);
  }
}

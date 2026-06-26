import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { UsersService } from './users.service';
import { AgentListQueryDto } from './dto/agent-list-query.dto';
import {
  CreateStaffDto,
  StaffListQueryDto,
  UpdateStaffDto,
  UpdateStaffStatusDto,
} from './dto/staff.dto';

/**
 * UsersController — endpoints staff sobre cuentas internas (agentes).
 *
 * Dos superficies con permisos distintos:
 *
 *  1. `GET /admin/users` — selector de agentes asignables (CASL `List.Agent`,
 *     todo staff). Consumido por `NewTaskModal` (Sprint 8 Fase A).
 *
 *  2. `/admin/users/staff/*` — GESTIÓN de cuentas staff (alta/baja/rol),
 *     **solo superadmin** (CASL `Manage.Agent`; ver ADR-067 §granularidad por
 *     rol staff). Cierra GL-21 (audit 2026-06-25 §6 Tier 3): antes solo se podía
 *     dar de alta/baja un agente en BD → offboarding manual = riesgo
 *     operativo/seguridad. La separación de rutas mantiene intactos los permisos
 *     del selector legacy (`List.Agent`) frente a la gestión (`Manage.Agent`).
 *
 * Triple guard ([ADR-067 §4]): JwtAuthGuard → AdminOnlyGuard → PoliciesGuard.
 */
@ApiTags('Admin · Users')
@ApiBearerAuth()
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

  /* ───────────────────── Gestión de staff (GL-21, superadmin) ───────────────────── */

  @Get('staff')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Agent))
  @ApiOperation({
    summary: 'Listar cuentas de staff para gestión (superadmin)',
    description:
      'Listado de gestión: todos los roles staff y, por defecto, todos los ' +
      'estados (active/inactive/blocked/pending). Filtros: `role[]`, `search`, ' +
      '`status`, `page`, `limit`.',
  })
  async listStaff(@Query() query: StaffListQueryDto) {
    return this.usersService.listStaff(query);
  }

  @Get('staff/:id')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Agent))
  @ApiOperation({ summary: 'Detalle de una cuenta de staff (superadmin)' })
  async getStaff(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getStaff(id);
  }

  @Post('staff')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Agent))
  @ApiOperation({ summary: 'Crear una cuenta de staff (superadmin)' })
  @ApiCreatedResponse({ description: 'La cuenta creada (sin secretos).' })
  async createStaff(
    @Body() dto: CreateStaffDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.createStaff(dto, req.user.id);
  }

  @Patch('staff/:id')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Agent))
  @ApiOperation({
    summary: 'Editar nombre/rol de una cuenta de staff (superadmin)',
  })
  async updateStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.updateStaff(id, dto, req.user.id);
  }

  @Patch('staff/:id/status')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Agent))
  @ApiOperation({
    summary:
      'Activar/desactivar (offboarding) una cuenta de staff (superadmin)',
    description:
      'La baja (`inactive`) revoca todas las sesiones activas del agente; el ' +
      'acceso se corta al instante. Protege contra auto-desactivación y contra ' +
      'dejar el sistema sin superadmin activo.',
  })
  async setStaffStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.setStaffStatus(id, dto.status, req.user.id);
  }
}

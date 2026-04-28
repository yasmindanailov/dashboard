import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import { AuditAccess } from '../audit/audit.decorator';
import { ClientsService } from './clients.service';
import {
  ClientListQueryDto,
  UpdateClientProfileDto,
  AddNoteDto,
  CreateClientNoteDto,
  ClientNoteQueryDto,
} from './dto/client.dto';
import {
  CreateBillingProfileDto,
  UpdateBillingProfileDto,
} from './dto/billing-profile.dto';

/**
 * ClientsController — endpoints staff sobre datos de cliente.
 *
 * Sprint 9.6 (DC.7 + ADR-068): multi-path canónico `/api/v1/admin/clients/*`
 * con alias legacy `/api/v1/clients/*` durante ventana de deprecación
 * (Sunset Wed, 31 Dec 2026 23:59:59 GMT — cerrado en commit pre-deploy
 * Sprint 14). El `LegacyRouteDeprecationMiddleware` añade headers
 * `Deprecation: true` + `Sunset` + `Link` solo a las llamadas al path legacy.
 *
 * Triple guard (defense in depth, ADR-067 §4):
 *  1. JwtAuthGuard — usuario autenticado.
 *  2. AdminOnlyGuard — corte temprano antes de CASL (clientes y partners
 *     no deben llegar a estos endpoints; CASL ya lo bloquearía pero
 *     `AdminOnlyGuard` es más explícito y barato).
 *  3. PoliciesGuard — granularidad fina por Subject CASL (Client/ClientNote/
 *     BillingProfile) según rol staff.
 */
@ApiTags('Clients')
@Controller(['admin/clients', 'clients'])
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  /* ═══════════════════════════════════════
     CLIENT CRUD
     ═══════════════════════════════════════ */

  @Get()
  @CheckPolicies((ability) => ability.can(Action.List, Subject.Client))
  findAll(@Query() query: ClientListQueryDto) {
    return this.clientsService.findAll(query);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Client))
  @AuditAccess('Client')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Client))
  updateProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientProfileDto,
  ) {
    return this.clientsService.updateProfile(id, dto);
  }

  // Legacy note endpoint (backward compat) — also creates structured note
  @Post(':id/notes')
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.ClientNote))
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: AddNoteDto,
  ) {
    const user = req.user;
    return this.clientsService.addNote(id, dto, user.id);
  }

  /* ═══════════════════════════════════════
     STRUCTURED NOTES (7.H19)
     ═══════════════════════════════════════ */

  @Get(':id/structured-notes')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.ClientNote))
  listStructuredNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ClientNoteQueryDto,
  ) {
    return this.clientsService.listStructuredNotes(id, query);
  }

  @Post(':id/structured-notes')
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.ClientNote))
  createStructuredNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateClientNoteDto,
  ) {
    const user = req.user;
    return this.clientsService.createStructuredNote(id, user.id, dto);
  }

  @Patch('notes/:noteId/pin')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.ClientNote))
  toggleNotePin(@Param('noteId', ParseUUIDPipe) noteId: string) {
    return this.clientsService.toggleNotePin(noteId);
  }

  /* ═══════════════════════════════════════
     BILLING PROFILES
     ═══════════════════════════════════════ */

  @Get(':id/billing-profiles')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.BillingProfile))
  getBillingProfiles(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.getBillingProfiles(id);
  }

  @Post(':id/billing-profiles')
  @CheckPolicies((ability) =>
    ability.can(Action.Create, Subject.BillingProfile),
  )
  createBillingProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBillingProfileDto,
  ) {
    return this.clientsService.createBillingProfile(id, dto);
  }

  @Patch(':id/billing-profiles/:profileId')
  @CheckPolicies((ability) =>
    ability.can(Action.Update, Subject.BillingProfile),
  )
  updateBillingProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: UpdateBillingProfileDto,
  ) {
    return this.clientsService.updateBillingProfile(id, profileId, dto);
  }

  @Delete(':id/billing-profiles/:profileId')
  @CheckPolicies((ability) =>
    ability.can(Action.Delete, Subject.BillingProfile),
  )
  deleteBillingProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    return this.clientsService.deleteBillingProfile(id, profileId);
  }

  @Patch(':id/billing-profiles/:profileId/default')
  @CheckPolicies((ability) =>
    ability.can(Action.Update, Subject.BillingProfile),
  )
  setDefaultBillingProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    return this.clientsService.setDefaultBillingProfile(id, profileId);
  }
}

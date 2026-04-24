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
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import { ClientsService } from './clients.service';
import {
  ClientListQueryDto,
  UpdateClientProfileDto,
  AddNoteDto,
  CreateClientNoteDto,
  ClientNoteQueryDto,
} from './dto/client.dto';
import { CreateBillingProfileDto, UpdateBillingProfileDto } from './dto/billing-profile.dto';

@ApiTags('Clients')
@Controller('clients')
@UseGuards(JwtAuthGuard, PoliciesGuard)
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
    @Req() req: Request,
    @Body() dto: AddNoteDto,
  ) {
    const user = req.user as any;
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
    @Req() req: Request,
    @Body() dto: CreateClientNoteDto,
  ) {
    const user = req.user as any;
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
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.BillingProfile))
  createBillingProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBillingProfileDto,
  ) {
    return this.clientsService.createBillingProfile(id, dto);
  }

  @Patch(':id/billing-profiles/:profileId')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.BillingProfile))
  updateBillingProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: UpdateBillingProfileDto,
  ) {
    return this.clientsService.updateBillingProfile(id, profileId, dto);
  }

  @Delete(':id/billing-profiles/:profileId')
  @CheckPolicies((ability) => ability.can(Action.Delete, Subject.BillingProfile))
  deleteBillingProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    return this.clientsService.deleteBillingProfile(id, profileId);
  }

  @Patch(':id/billing-profiles/:profileId/default')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.BillingProfile))
  setDefaultBillingProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    return this.clientsService.setDefaultBillingProfile(id, profileId);
  }
}

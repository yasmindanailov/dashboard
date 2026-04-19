import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleSlug } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ClientsService } from './clients.service';
import { ClientListQueryDto, UpdateClientProfileDto, AddNoteDto } from './dto/client.dto';
import { CreateBillingProfileDto, UpdateBillingProfileDto } from './dto/billing-profile.dto';

@ApiTags('Clients')
@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  /* ═══════════════════════════════════════
     CLIENT CRUD
     ═══════════════════════════════════════ */

  @Get()
  @Roles(RoleSlug.superadmin, RoleSlug.agent_full, RoleSlug.agent_billing, RoleSlug.agent_support)
  findAll(@Query() query: ClientListQueryDto) {
    return this.clientsService.findAll(query);
  }

  @Get(':id')
  @Roles(RoleSlug.superadmin, RoleSlug.agent_full, RoleSlug.agent_billing, RoleSlug.agent_support)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleSlug.superadmin, RoleSlug.agent_full, RoleSlug.agent_billing)
  updateProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientProfileDto,
  ) {
    return this.clientsService.updateProfile(id, dto);
  }

  @Post(':id/notes')
  @Roles(RoleSlug.superadmin, RoleSlug.agent_full, RoleSlug.agent_billing, RoleSlug.agent_support)
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddNoteDto,
  ) {
    return this.clientsService.addNote(id, dto);
  }

  /* ═══════════════════════════════════════
     BILLING PROFILES
     ═══════════════════════════════════════ */

  @Get(':id/billing-profiles')
  @Roles(RoleSlug.superadmin, RoleSlug.agent_full, RoleSlug.agent_billing)
  getBillingProfiles(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.getBillingProfiles(id);
  }

  @Post(':id/billing-profiles')
  @Roles(RoleSlug.superadmin, RoleSlug.agent_full, RoleSlug.agent_billing)
  createBillingProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateBillingProfileDto,
  ) {
    return this.clientsService.createBillingProfile(id, dto);
  }

  @Patch(':id/billing-profiles/:profileId')
  @Roles(RoleSlug.superadmin, RoleSlug.agent_full, RoleSlug.agent_billing)
  updateBillingProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: UpdateBillingProfileDto,
  ) {
    return this.clientsService.updateBillingProfile(id, profileId, dto);
  }

  @Delete(':id/billing-profiles/:profileId')
  @Roles(RoleSlug.superadmin, RoleSlug.agent_full, RoleSlug.agent_billing)
  deleteBillingProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    return this.clientsService.deleteBillingProfile(id, profileId);
  }

  @Patch(':id/billing-profiles/:profileId/default')
  @Roles(RoleSlug.superadmin, RoleSlug.agent_full, RoleSlug.agent_billing)
  setDefaultBillingProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    return this.clientsService.setDefaultBillingProfile(id, profileId);
  }
}

import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import {
  DomainRegistrantService,
  RegistrantProfile,
  RegistrantProfileResponse,
} from './domain-registrant.service';
import { UpdateRegistrantDto } from './dto/registrant.dto';

/**
 * DomainRegistrantController — Sprint 15D Fase 15D.G·2.
 *
 * Perfil de titular (WHOIS) self-service del cliente. `GET` devuelve sus datos;
 * `PUT` los guarda y los propaga al registrar (auto-push). Self-scoped por
 * `req.user.id` (cada cliente solo edita su propio titular). Es la pieza que
 * desbloquea `modify_contacts` (1 titular/cliente → todos sus dominios).
 */
@ApiTags('Domains (cliente)')
@ApiBearerAuth()
@Controller('domains/registrant')
@UseGuards(JwtAuthGuard)
export class DomainRegistrantController {
  constructor(private readonly registrant: DomainRegistrantService) {}

  @Get()
  @ApiOperation({ summary: 'Datos de titular (WHOIS) del cliente.' })
  async get(@Req() req: AuthenticatedRequest): Promise<RegistrantProfile> {
    return this.registrant.getRegistrant(req.user.id);
  }

  @Put()
  @ApiOperation({
    summary: 'Guarda los datos de titular y los propaga al registrar.',
  })
  async update(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateRegistrantDto,
  ): Promise<RegistrantProfileResponse> {
    return this.registrant.updateRegistrant(req.user.id, dto);
  }
}

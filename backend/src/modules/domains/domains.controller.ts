import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CheckDomainAvailabilityDto } from './dto/check-availability.dto';
import { ListDomainsQueryDto } from './dto/list-domains.dto';
import {
  CheckDomainAvailabilityResponse,
  DomainsService,
  ListDomainsResponse,
} from './domains.service';

/**
 * DomainsController — Sprint 15D Fase 15D.F.2/F.4 (ADR-084 §2/§3).
 *
 * Superficie REST específica de dominios del portal cliente:
 *   - `POST /domains/check-availability` — buscador (pre-venta, sin efectos).
 *   - `GET  /domains`                    — "Mis dominios" (services type=domain).
 *
 * La COMPRA de dominios va por el carrito unificado (`POST /billing/checkout/items`,
 * 15D.F.4) — no hay endpoint de checkout específico de dominios. Auth: `JwtAuthGuard`
 * (cualquier usuario autenticado busca; el listado es self-scoped por `req.user.id`).
 * El precio se calcula SIEMPRE server-side (R5); el registrar por capability (R4).
 */
@ApiTags('Domains (cliente)')
@ApiBearerAuth()
@Controller('domains')
@UseGuards(JwtAuthGuard)
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Post('check-availability')
  @HttpCode(HttpStatus.OK) // es una consulta, no una creación
  @ApiOperation({
    summary:
      'Disponibilidad + precio de venta de un SLD en los TLDs ofertables.',
  })
  async checkAvailability(
    @Body() dto: CheckDomainAvailabilityDto,
  ): Promise<CheckDomainAvailabilityResponse> {
    return this.domains.checkAvailability({ sld: dto.sld, tlds: dto.tlds });
  }

  @Get()
  @ApiOperation({
    summary: 'Mis dominios (services type=domain) con expiración + estado.',
  })
  async listMine(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListDomainsQueryDto,
  ): Promise<ListDomainsResponse> {
    return this.domains.listMine(req.user.id, {
      status: query.status,
      page: query.page,
      limit: query.limit,
    });
  }
}

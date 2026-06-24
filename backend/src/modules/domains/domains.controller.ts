import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { SubmitTransferAuthDto, TransferQuoteDto } from './dto/transfer.dto';
import {
  CheckDomainAvailabilityResponse,
  DomainsService,
  DomainTransferQuote,
  DomainTransferStatus,
  ListDomainsResponse,
} from './domains.service';

/** Roles staff (mismo criterio que el resto de controllers). */
const ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_billing'];

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

  /* ═══════════════════════════════════════
     TRANSFER-IN (Sprint 15D.II.T2c.3) — carrito único + auth-code post-checkout
     ═══════════════════════════════════════ */

  @Post('transfer-quote')
  @HttpCode(HttpStatus.OK) // consulta de precio, no creación
  @ApiOperation({
    summary:
      'Precio de venta del transfer de un FQDN (pre-carrito, server-side R5).',
  })
  async transferQuote(
    @Body() dto: TransferQuoteDto,
  ): Promise<DomainTransferQuote> {
    return this.domains.transferQuote(dto.fqdn);
  }

  /**
   * Aporta el EPP auth-code de un transfer-in YA en el carrito/comprado (service
   * `pending`). Arranca la FSM (`initiateTransferIn`). El auth-code es secreto
   * (R12) — viaja en el body, no se loguea. Ownership self-scoped; admin puede
   * actuar por cualquier cliente (gestión de soporte).
   */
  @Post(':id/transfer/submit-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Aportar el código EPP de un transfer-in (arranca la transferencia).',
  })
  async submitTransferAuth(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitTransferAuthDto,
  ): Promise<DomainTransferStatus> {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    return this.domains.submitTransferAuthCode(
      id,
      dto.authCode,
      req.user.id,
      isAdmin,
    );
  }
}

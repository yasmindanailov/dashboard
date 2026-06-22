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

import { Action, Subject } from '../../core/casl/permissions';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CartCheckoutDto } from './dto/cart-checkout.dto';
import { CheckDomainAvailabilityDto } from './dto/check-availability.dto';
import { ListDomainsQueryDto } from './dto/list-domains.dto';
import {
  CartCheckoutResult,
  CheckDomainAvailabilityResponse,
  DomainsService,
  ListDomainsResponse,
} from './domains.service';

/**
 * DomainsController — Sprint 15D Fase 15D.F.2/F.4 (ADR-084 §2/§3).
 *
 * Superficie REST del comercio de dominios (portal cliente):
 *   - `POST /domains/check-availability` — buscador (pre-venta, sin efectos).
 *   - `GET  /domains`                    — "Mis dominios" (services type=domain).
 *   - `POST /domains/cart/checkout`      — registrar el carrito (N dominios).
 *
 * Auth: `JwtAuthGuard` para toda la superficie (cualquier usuario autenticado
 * puede buscar; el listado es self-scoped por `req.user.id`). El checkout añade
 * `PoliciesGuard` + `Create.Invoice` (paridad con `/billing/checkout`). El precio
 * se calcula SIEMPRE server-side (R5); el registrar se resuelve por capability
 * (R4). Rate-limiting por-IP del buscador = deuda de hardening (HIGH-1, Enfoque B).
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

  @Post('cart/checkout')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PoliciesGuard)
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.Invoice))
  @ApiOperation({
    summary:
      'Registrar los dominios del carrito (multi-ítem) — crea N services + 1 factura.',
  })
  async checkoutCart(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CartCheckoutDto,
  ): Promise<CartCheckoutResult> {
    return this.domains.checkoutCart(req.user.id, {
      items: dto.items.map((i) => ({
        domainName: i.domain_name,
        years: i.years,
      })),
      billingProfileId: dto.billing_profile_id,
    });
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { DomainPricingSyncSummary } from '../../core/provisioning/domain-pricing-sync-registry.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { AdminDomainsService, DomainPricingRow } from './admin-domains.service';
import {
  DeleteDomainDto,
  ListDomainPricingQueryDto,
  SetManualPriceDto,
} from './dto/domain-pricing.dto';

/**
 * AdminDomainsController — Sprint 15D Fase 15D.G·1.
 *
 * Gestión admin de la **matriz de precios de dominios** (`domain_tld_pricing`),
 * lo que faltaba para que un producto de tipo `domain` sea operable: ver precios
 * por TLD, forzar sincronización con el registrar y fijar/revertir overrides
 * manuales. Triple guard staff (JwtAuthGuard + AdminOnlyGuard + PoliciesGuard);
 * CASL sobre `Subject.Product` (el pricing de dominios es responsabilidad de
 * quien gestiona el catálogo).
 */
@ApiTags('Admin / Domains')
@ApiBearerAuth()
@Controller('admin/domains')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class AdminDomainsController {
  constructor(private readonly admin: AdminDomainsService) {}

  @Get('pricing')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Product))
  @ApiOperation({
    summary: 'Matriz de precios de dominios por TLD×operación×años.',
  })
  async listPricing(
    @Query() query: ListDomainPricingQueryDto,
  ): Promise<DomainPricingRow[]> {
    return this.admin.listPricing({
      registrar: query.registrar,
      tld: query.tld,
      operation: query.operation,
    });
  }

  @Post('pricing/sync')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Product))
  @ApiOperation({
    summary: 'Sincroniza los precios con el registrar ahora (cron manual).',
  })
  async syncNow(): Promise<DomainPricingSyncSummary> {
    return this.admin.syncNow();
  }

  @Patch('pricing/:id')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Product))
  @ApiOperation({
    summary: 'Fija un override manual del precio de venta de una fila.',
  })
  async setManualPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetManualPriceDto,
  ): Promise<DomainPricingRow> {
    return this.admin.setManualPrice(id, dto.price);
  }

  @Delete('pricing/:id')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Product))
  @ApiOperation({
    summary: 'Revierte una fila a precio automático (source=sync).',
  })
  async revertToAuto(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DomainPricingRow> {
    return this.admin.revertToAuto(id);
  }

  @Post('services/:id/delete')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  @ApiOperation({
    summary:
      'Borra un dominio en período de gracia (destructivo) y cancela el servicio.',
  })
  async deleteDomain(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteDomainDto,
  ): Promise<{ id: string; status: string }> {
    return this.admin.deleteDomain(id, dto.reason, {
      userId: req.user.id,
      ipAddress: req.ip ?? '0.0.0.0',
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}

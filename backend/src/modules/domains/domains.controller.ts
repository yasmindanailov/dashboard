import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { CheckDomainAvailabilityDto } from './dto/check-availability.dto';
import {
  CheckDomainAvailabilityResponse,
  DomainsService,
} from './domains.service';

/**
 * DomainsController — Sprint 15D Fase 15D.F.2 (ADR-084 §2/§3).
 *
 * Superficie REST del comercio de dominios (portal cliente). Hoy: el buscador
 * de disponibilidad. Crece en F.2/F.4 (checkout de registro, gestión).
 *
 * Auth: cualquier usuario autenticado puede buscar dominios (operación de
 * pre-venta sin efectos). El precio se calcula SIEMPRE server-side (R5). El
 * rate-limiting por-IP es deuda de la fase de hardening (auditoría HIGH-1,
 * Enfoque B) — no se aplica aquí todavía.
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
}

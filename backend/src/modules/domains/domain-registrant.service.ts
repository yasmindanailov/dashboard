import { Injectable, Logger } from '@nestjs/common';

import { getErrorMessage } from '../../core/common/utils/error.util';
import { PrismaService } from '../../core/database/prisma.service';
import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import {
  ClientPublicData,
  ProvisionerPluginError,
} from '../../core/provisioning/types';

import { UpdateRegistrantDto } from './dto/registrant.dto';

/** Datos de titular (WHOIS) editables por el cliente (User + ClientProfile). */
export interface RegistrantProfile {
  first_name: string | null;
  last_name: string | null;
  /** Solo lectura (el cambio de email es otro flujo). */
  email: string;
  company_name: string | null;
  tax_id: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
}

/** Estado de la propagación al registrar tras guardar el perfil. */
export interface RegistrantSyncStatus {
  /** Se propagó el WHOIS al registrar. */
  propagated: boolean;
  /** Dominios del cliente afectados (comparten el contacto). */
  domainsAffected: number;
  /** El nombre del titular cambió → posible verificación + lock ICANN 60d. */
  nameChanged: boolean;
  /** Mensaje si la propagación falló (el perfil se guardó igualmente). */
  error: string | null;
}

export interface RegistrantProfileResponse {
  profile: RegistrantProfile;
  registrarSync: RegistrantSyncStatus;
}

/**
 * Sprint 15D Fase 15D.G·2 — perfil de titular (WHOIS) self-service.
 *
 * El cliente edita sus datos de titular (1 por cliente — ADR-081 A2); al guardar
 * se persisten en `User` (nombre) + `ClientProfile` (resto) y se **propagan al
 * registrar** (`contacts/modify` → todos sus dominios), resuelto por capability
 * (`is_domain_registrar`, R4 — NUNCA por slug).
 *
 * Robusto: el guardado del perfil (tx corta, sin HTTP) y la propagación (HTTP al
 * registrar, fuera de tx — DC.NEW-66) están separados. Si la propagación falla
 * (perfil incompleto → `REGISTRANT_INELIGIBLE`, o proveedor caído), el perfil
 * queda guardado y el resultado lo refleja (`registrarSync.error`) — el cliente
 * no pierde sus datos.
 */
@Injectable()
export class DomainRegistrantService {
  private readonly logger = new Logger(DomainRegistrantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PluginRegistryService,
  ) {}

  /** Datos de titular actuales del cliente. */
  async getRegistrant(userId: string): Promise<RegistrantProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        first_name: true,
        last_name: true,
        client_profile: {
          select: {
            company_name: true,
            tax_id: true,
            phone: true,
            address_line1: true,
            address_line2: true,
            city: true,
            state: true,
            postal_code: true,
            country: true,
          },
        },
      },
    });
    const p = user?.client_profile;
    return {
      first_name: user?.first_name ?? null,
      last_name: user?.last_name ?? null,
      email: user?.email ?? '',
      company_name: p?.company_name ?? null,
      tax_id: p?.tax_id ?? null,
      phone: p?.phone ?? null,
      address_line1: p?.address_line1 ?? null,
      address_line2: p?.address_line2 ?? null,
      city: p?.city ?? null,
      state: p?.state ?? null,
      postal_code: p?.postal_code ?? null,
      country: p?.country ?? null,
    };
  }

  /**
   * Guarda los datos de titular + propaga al registrar (auto-push). El guardado
   * es atómico (User + ClientProfile); la propagación es best-effort y no
   * deshace el guardado si falla.
   */
  async updateRegistrant(
    userId: string,
    dto: UpdateRegistrantDto,
  ): Promise<RegistrantProfileResponse> {
    const userData: { first_name?: string; last_name?: string } = {};
    if (dto.first_name !== undefined) userData.first_name = dto.first_name;
    if (dto.last_name !== undefined) userData.last_name = dto.last_name;

    const profileData = {
      ...(dto.company_name !== undefined
        ? { company_name: dto.company_name }
        : {}),
      ...(dto.tax_id !== undefined ? { tax_id: dto.tax_id } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      ...(dto.address_line1 !== undefined
        ? { address_line1: dto.address_line1 }
        : {}),
      ...(dto.address_line2 !== undefined
        ? { address_line2: dto.address_line2 }
        : {}),
      ...(dto.city !== undefined ? { city: dto.city } : {}),
      ...(dto.state !== undefined ? { state: dto.state } : {}),
      ...(dto.postal_code !== undefined
        ? { postal_code: dto.postal_code }
        : {}),
      ...(dto.country !== undefined ? { country: dto.country } : {}),
    };

    // 1. Persistencia atómica (tx corta, sin HTTP — DC.NEW-66).
    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userData });
      }
      await tx.clientProfile.upsert({
        where: { user_id: userId },
        create: { user_id: userId, ...profileData },
        update: profileData,
      });
    });

    // 2. Propagación al registrar (HTTP fuera de tx, best-effort).
    const registrarSync = await this.propagate(userId);
    const profile = await this.getRegistrant(userId);
    return { profile, registrarSync };
  }

  /** Propaga el WHOIS actual al registrar (capability-routed, best-effort). */
  private async propagate(userId: string): Promise<RegistrantSyncStatus> {
    const noop: RegistrantSyncStatus = {
      propagated: false,
      domainsAffected: 0,
      nameChanged: false,
      error: null,
    };
    const plugin = this.registry.getByCapability('is_domain_registrar');
    if (!plugin || typeof plugin.updateRegistrantContact !== 'function') {
      return noop;
    }
    const client = await this.loadClientPublicData(userId);
    if (!client) return noop;

    try {
      const r = await plugin.updateRegistrantContact(client);
      return {
        propagated: r.propagated,
        domainsAffected: r.domainsAffected,
        nameChanged: r.nameChanged,
        error: null,
      };
    } catch (err) {
      const message =
        err instanceof ProvisionerPluginError
          ? err.message
          : 'No se pudo sincronizar con el registrar. El perfil se guardó; reinténtalo más tarde.';
      this.logger.warn(
        `registrant propagate user=${userId} falló: ${getErrorMessage(err)}`,
      );
      return { ...noop, error: message };
    }
  }

  /**
   * Construye `ClientPublicData` desde User + ClientProfile (réplica del mapeo
   * ADR-077 A12 del orquestador — datos, no servicio cross-módulo).
   */
  private async loadClientPublicData(
    userId: string,
  ): Promise<ClientPublicData | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        language: true,
        client_profile: {
          select: {
            company_name: true,
            phone: true,
            tax_id: true,
            address_line1: true,
            address_line2: true,
            city: true,
            state: true,
            postal_code: true,
            country: true,
          },
        },
      },
    });
    if (!user) return null;
    const p = user.client_profile;
    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      company_name: p?.company_name ?? null,
      phone: p?.phone ?? null,
      locale: user.language ?? null,
      country_code: p?.country ?? null,
      address_line1: p?.address_line1 ?? null,
      address_line2: p?.address_line2 ?? null,
      city: p?.city ?? null,
      state: p?.state ?? null,
      postal_code: p?.postal_code ?? null,
      tax_id: p?.tax_id ?? null,
    };
  }
}

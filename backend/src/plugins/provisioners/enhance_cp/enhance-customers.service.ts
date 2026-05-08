/**
 * Sprint 15C Fase 15C.C (2026-05-08) — EnhanceCustomersService.
 *
 * Materializa ADR-083 §2 decisión 8: lazy create + 3-step idempotency con
 * advisory lock para garantizar atomicidad cross-process del mapping
 * Client Aelium ↔ Customer Org Enhance.
 *
 * Doctrina canónica:
 *
 *   - Una sola fila por User en `enhance_customers` (PK natural user_id).
 *   - Lazy create al primer hosting Enhance del cliente — NUNCA en alta
 *     del User (la mayoría de Users pueden no tener hosting Enhance jamás).
 *   - Advisory lock per-user (`pg_advisory_xact_lock(ns, key)`) evita race
 *     condition cross-process: si dos jobs BullMQ provisioning concurrentes
 *     llegan para el mismo User, solo uno ejecuta el flow 6-step; el otro
 *     espera y lee el mapping ya persistido.
 *   - 3-step idempotency:
 *
 *       Step 1: SELECT FROM enhance_customers WHERE user_id = ?
 *               → si existe, return (caso normal post-primera provisión).
 *       Step 2: GET /orgs/{master}/customers?search={email}
 *               → defensive cross-restart: si Enhance ya tiene el customer
 *                 (creado fuera de Aelium, restore parcial, crash mid-flight
 *                 entre create + insert mapping), recupera + INSERT mapping.
 *       Step 3: ejecutar el provision flow 6-step (steps 1-4: customer +
 *               login + member + owner) + INSERT mapping.
 *
 *   - Steps 5-6 del provision flow (createSubscription + createWebsite) NO
 *     viven aquí — son responsabilidad del plugin porque son por-service,
 *     no por-customer. Un mismo customer puede tener N subscriptions/websites.
 *
 * Reglas:
 *   - R4: este service vive en `plugins/provisioners/enhance_cp/`. Importa
 *     `core/database/prisma.service` + el cliente HTTP del propio plugin.
 *   - R7: errores semánticos vía `ProvisionerPluginError` propagados desde
 *     el cliente HTTP (no se interceptan).
 *   - R12: la password generada (Step 3.b) NUNCA se persiste en
 *     `services.metadata` — vive solo en memoria durante el flow + se la
 *     entrega Enhance al cliente cuando éste resetea con la action
 *     `reset_account_password`.
 */

import * as crypto from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';

import { EnhanceApiClient, MasterOrgId } from './api';

/** Identificadores Enhance del owner del customer org. */
export interface EnhanceCustomerMapping {
  readonly user_id: string;
  readonly enhance_org_id: string;
  readonly enhance_owner_login_id: string;
  readonly enhance_owner_member_id: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/** Subset de User que el service necesita — passed-in por el plugin desde ProvisionContext. */
export interface UserForEnhance {
  readonly id: string;
  readonly email: string;
  /**
   * Nombre legible para Enhance Customer + Member + Login.
   * El plugin lo construye desde `client.company_name` (si existe) o
   * `${first_name} ${last_name}` antes de invocar.
   */
  readonly displayName: string;
}

/**
 * Namespace canónico para `pg_advisory_xact_lock(ns, key)` del Sprint 15C.
 * Valor arbitrario único en el proyecto — combinación sprint+componente para
 * garantizar que NO colisiona con futuros usos del advisory lock en otros
 * módulos (ej. outbox dispatch, cron schedulers, etc.).
 */
const ADVISORY_LOCK_NAMESPACE_ENHANCE_CUSTOMERS = 1_500_301;

@Injectable()
export class EnhanceCustomersService {
  private readonly logger = new Logger(EnhanceCustomersService.name);

  constructor(
    @Optional()
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Garantiza que existe una fila `enhance_customers` para el `user`.
   * Si no existe, ejecuta el flow 6-step (steps 1-4) y persiste el mapping.
   *
   * Idempotencia robusta cross-process gracias a `pg_advisory_xact_lock`:
   * dos invocaciones concurrentes para el mismo `user.id` se serializan;
   * la segunda lee el mapping ya persistido en Step 1.
   */
  async ensureCustomer(
    user: UserForEnhance,
    api: EnhanceApiClient,
    masterOrgId: MasterOrgId,
  ): Promise<EnhanceCustomerMapping> {
    return this.prisma.$transaction(async (tx) => {
      // Step 0: advisory lock per-user (auto-released on tx commit/rollback).
      const lockKey = userAdvisoryLockKey(user.id);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE_ENHANCE_CUSTOMERS}::int4, ${lockKey}::int4)`;

      // Step 1: cache local.
      const existing = await tx.enhanceCustomer.findUnique({
        where: { user_id: user.id },
      });
      if (existing) {
        this.logger.debug(
          `enhance_customers cache hit for user=${user.id} (org=${existing.enhance_org_id})`,
        );
        return existing;
      }

      // Step 2: defensive cross-restart — search Enhance by email.
      const search = await api.searchCustomersByEmail(masterOrgId, user.email);
      if (search.total > 0) {
        const item = search.items[0];
        if (item.ownerId && item.ownerLoginId) {
          this.logger.warn(
            `enhance_customers cross-restart recovery for user=${user.id}: ` +
              `customer org=${item.id} ya existe en Enhance (re-vincula mapping local).`,
          );
          return tx.enhanceCustomer.create({
            data: {
              user_id: user.id,
              enhance_org_id: item.id,
              enhance_owner_login_id: item.ownerLoginId,
              enhance_owner_member_id: item.ownerId,
            },
          });
        }
        // Enhance encontró el customer pero NO tiene ownerId/ownerLoginId
        // pobladas — caso patológico (customer huérfano sin Owner). El
        // reconcile cron debería detectarlo + alertar superadmin
        // (`service.reconciled_external_change`). Aquí seguimos a Step 3
        // para crear un Owner nuevo, que sobrescribe al ausente.
        this.logger.error(
          `enhance_customers Step 2: customer org=${item.id} encontrado por email=${user.email} ` +
            `pero sin ownerId/ownerLoginId. Procediendo a Step 3 (recovery via flow 6-step).`,
        );
      }

      // Step 3: run flow 6-step (steps 1-4: customer + login + member + owner).
      this.logger.log(
        `enhance_customers Step 3: ejecutando flow 6-step (steps 1-4) para user=${user.id}.`,
      );
      const result = await this.runProvisionStepsCustomerOwner(
        api,
        masterOrgId,
        user,
      );
      const created = await tx.enhanceCustomer.create({
        data: {
          user_id: user.id,
          enhance_org_id: result.customerOrgId,
          enhance_owner_login_id: result.loginId,
          enhance_owner_member_id: result.memberId,
        },
      });
      this.logger.log(
        `enhance_customers Step 3 completado: user=${user.id} → org=${created.enhance_org_id}.`,
      );
      return created;
    });
  }

  /**
   * Steps 1-4 del provision flow 6-step (ADR-083 §3 decisión 10):
   *
   *   1. POST /orgs/{master}/customers          → { id: customer_org_id }
   *   2. POST /logins?orgId={cust}              → { id: login_id }
   *   3. POST /orgs/{cust}/members              → { id: member_id }
   *   4. PUT  /orgs/{cust}/owner                → 200 OK
   *
   * Steps 5-6 (subscription + website) viven en el plugin porque son
   * por-service (un customer puede tener N services).
   */
  private async runProvisionStepsCustomerOwner(
    api: EnhanceApiClient,
    masterOrgId: MasterOrgId,
    user: UserForEnhance,
  ): Promise<{
    customerOrgId: string;
    loginId: string;
    memberId: string;
  }> {
    // Step 1: createCustomer
    const customer = await api.createCustomer(masterOrgId, {
      name: user.displayName,
    });

    // Step 2: createLogin con password aleatoria (NO se persiste — el cliente
    // la cambia via reset_account_password action — ADR-083 §1 decisión 4).
    const login = await api.createLogin(customer.id, {
      email: user.email,
      password: generateOneTimePassword(),
      name: user.displayName,
    });

    // Step 3: addMember Owner
    const member = await api.addMember(customer.id, {
      loginId: login.id,
      roles: ['Owner'],
    });

    // Step 4: setOwner
    await api.setOwner(customer.id, { memberId: member.id });

    return {
      customerOrgId: customer.id,
      loginId: login.id,
      memberId: member.id,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convierte un UUID v4 string a un signed int32 para pasar a
 * `pg_advisory_xact_lock(ns, key)`.
 *
 * Determinístico (mismo UUID → mismo int32). Colisiones posibles a partir
 * de ~65k users (paradoja del cumpleaños sobre 32 bits) PERO una colisión
 * solo provoca que dos users distintos serialicen su lock — coste:
 * latencia adicional cuando dos provisioning concurrentes coinciden con
 * la misma colisión, NO bug de correctness.
 */
export function userAdvisoryLockKey(userId: string): number {
  // Toma los primeros 8 hex chars del UUID (sin guiones) = 32 bits.
  // `| 0` fuerza signed int32 (descartando los bits superiores), evitando
  // overflow al pasar a PostgreSQL int4.
  return parseInt(userId.replace(/-/g, '').slice(0, 8), 16) | 0;
}

/**
 * Genera password aleatoria criptográficamente segura.
 * 32 hex chars (128 bits) — suficiente para que el cliente NO la use jamás
 * (el flujo canónico es resetearla via `reset_account_password`).
 */
function generateOneTimePassword(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Re-export para tests + código externo que no quiera importar PrismaClient global.
export type { PrismaClient as _PrismaClientForTests };

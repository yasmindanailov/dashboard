import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTOs Sprint 11 Fase 11.D — Provisioning REST endpoints.
 *
 * Cubren los 7 endpoints de la fase:
 *   Cliente: GET /services, GET /services/:id, POST /services/:id/sso,
 *            POST /services/:id/actions/:slug.
 *   Admin:   GET /admin/services, POST /admin/services/:id/reprovision,
 *            POST /admin/services/:id/deprovision.
 */

// ────────────────────────────────────────────────────────────────────────────
// Cliente
// ────────────────────────────────────────────────────────────────────────────

export class ServiceListQueryDto {
  /** Filtra por status real del service (active/pending/cancelled/etc.). */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  /**
   * Excluye un `product.type` del listado (Sprint 15D Fase 15D.F.4). "Mis
   * servicios" pasa `exclude_type=domain` para no duplicar los dominios, que
   * tienen su propia vista (`/dashboard/domains`).
   */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  exclude_type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * F4·W3 — `PATCH /services/:id/auto-renew`. Preferencia de renovación
 * automática (invoice-driven, Aelium-side). Aplica a hosting y dominios.
 */
export class SetAutoRenewDto {
  @IsBoolean()
  enabled: boolean;
}

export class ExecuteActionDto {
  /**
   * Payload del action. Cada plugin define el shape vía `payloadSchema`
   * en su `inlineActions[]`. El wrapper canónico
   * `executeActionWithCacheInvalidation` valida que el slug está declarado.
   * Plugins triviales `internal`/`manual` rechazan cualquier slug
   * (catálogo vacío).
   */
  @IsObject()
  payload: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────────────
// Admin
// ────────────────────────────────────────────────────────────────────────────

export class AdminServiceListQueryDto {
  /** Filtro por user/cliente. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  user_id?: string;

  /** Filtro por slug del provisioner (denormalizado en `services`). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provisioner_slug?: string;

  /** Filtro por status del service. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  /** Búsqueda libre en label/domain. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export enum DeprovisionReasonDto {
  cancelled = 'cancelled',
  expired = 'expired',
  admin_override = 'admin_override',
}

export class DeprovisionDto {
  /** Motivo canónico de la cancelación administrativa. */
  @IsEnum(DeprovisionReasonDto)
  reason: DeprovisionReasonDto;

  /**
   * Nota interna opcional para el audit log (NO se muestra al cliente —
   * solo va a `audit_change_log.changes_after` + `cancellation_reason`).
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /**
   * Sprint 15C.II Fase E — si `false`, NO se envía el email de cancelación
   * al cliente (caso fraude confirmado donde no queremos avisar, cuentas de
   * test, etc.). Default `true` (comportamiento canónico: el cliente recibe
   * el email + campana vía listener `notifications-on-service-cancelled`).
   */
  @IsOptional()
  @IsBoolean()
  notify_client?: boolean;
}

/**
 * Sprint 15C.II Fase F — ADR-077 Amendment A4 (`POST /admin/services/:id/suspend`).
 *
 * Taxonomía canónica del motivo de suspensión. DEBE coincidir 1:1 con el tipo
 * `SuspensionReason` de [`core/provisioning/types.ts`](../../../core/provisioning/types.ts)
 * (la duplicación es inevitable: class-validator `@IsEnum` necesita un objeto
 * enum runtime, el contrato es una unión TS pura). Es **cliente-segura**: la UI
 * muestra al cliente la etiqueta localizada del enum, NUNCA la `internal_note`.
 */
export enum SuspensionReasonDto {
  overdue_payment = 'overdue_payment',
  abuse_investigation = 'abuse_investigation',
  scheduled_maintenance = 'scheduled_maintenance',
  gdpr_restriction = 'gdpr_restriction',
  // F4·W3 auto-renovación: el cliente desactivó la renovación → al vencer el
  // periodo pagado el servicio de hosting se suspende con este motivo.
  not_renewed = 'not_renewed',
  other = 'other',
}

export class SuspendServiceDto {
  /**
   * Motivo canónico de la suspensión. Se muestra al cliente como etiqueta
   * localizada (email + banner). Para `other`, la etiqueta cliente es genérica
   * — el email dirige a soporte para los detalles.
   */
  @IsEnum(SuspensionReasonDto)
  reason: SuspensionReasonDto;

  /**
   * Nota interna opcional (audit log + banner admin). NUNCA se incluye en
   * comunicaciones al cliente (ni siquiera para `reason='other'`). Se persiste
   * combinada en `services.suspension_reason` como `"<reason>: <internal_note>"`
   * (mismo patrón que `services.cancellation_reason`) — el frontend cliente
   * solo renderiza la parte `<reason>` (etiqueta localizada).
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internal_note?: string;

  /**
   * Si `false`, NO se envía el email de suspensión al cliente (fraude
   * confirmado, cuentas de test, etc.). Default `true` (el cliente recibe
   * email + campana vía listener `notifications-on-service-suspended`).
   */
  @IsOptional()
  @IsBoolean()
  notify_client?: boolean;
}

/**
 * Sprint 15C.II Fase F.6 — R1 (dossier §A.11.10.3.2): firma simétrica con
 * `SuspendServiceDto` / `DeprovisionDto`. `internal_note` opcional a nivel
 * DTO porque el mismo DTO sirve a dos paths: admin/modal (donde la nota es
 * obligatoria por R2 — validación en el servicio) y sistema (listener
 * auto-reactivar al pagar, que compone el body internamente).
 */
export class UnsuspendServiceDto {
  /**
   * Nota interna del admin que reactiva el servicio (audit log + `ClientNote`
   * vía `createFromServiceLifecycleAction`). En el path admin/modal es
   * **obligatoria** — la validación R2 vive en `ProvisioningService` (no en
   * el DTO) porque el mismo DTO sirve al path sistema con `actorUserId: null`
   * donde el body lo compone el listener.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internal_note?: string;
}

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditService } from '../../audit/audit.service';

/**
 * SupportInsideAuditListener — Sprint 8 Fase D.12.3 (R3 audit inmutable +
 * ADR-061 §"tier de cuenta visible" + ADR-017 §retención 730 días).
 *
 * Persiste los 4 eventos canónicos del módulo Support Inside en
 * `audit_change_log` para que el portal de transparencia cliente
 * (`/dashboard/transparency`) y el admin con CASL `Read.AuditLog` puedan
 * trazar el ciclo de vida de la suscripción y los slots.
 *
 * Eventos consumidos:
 *   - `support_inside.subscribed`  → action='subscribe'
 *   - `support_inside.cancelled`   → action='cancel'
 *   - `support_inside.slot_assigned` → action='assign_slot'
 *   - `support_inside.slot_released` → action='release_slot'
 *
 * Reglas:
 *   - `entity_type` distingue subscription vs slot — el portal cliente
 *     filtra por `entity_type='SupportInsideSubscription'` para mostrar
 *     "Tu plan" y `'SupportInsideSlot'` para "Tus slots" en tabs.
 *   - `user_id` siempre el del cliente afectado (actor) — los listeners
 *     que correrán cuando el sistema (cron) actúe (futuro Sprint 11
 *     `service.cancelled` cascada) usarán `user_id=null` con metadata
 *     `system_actor=true`.
 *   - R7: `AuditService.logChange` NUNCA relanza, así que este listener
 *     queda safe ante cualquier fallo del audit.
 *
 * Cumple R1 (módulos por eventos) — el `SupportInsideService` no llama
 * directo a `AuditService`; emite eventos y este listener los traduce.
 */
@Injectable()
export class SupportInsideAuditListener {
  private readonly logger = new Logger(SupportInsideAuditListener.name);

  constructor(private readonly audit: AuditService) {}

  @OnEvent('support_inside.subscribed')
  async onSubscribed(payload: {
    subscription_id: string;
    client_id: string;
    product_id: string;
    service_id: string;
  }): Promise<void> {
    await this.audit.logChange({
      user_id: payload.client_id,
      entity_type: 'SupportInsideSubscription',
      entity_id: payload.subscription_id,
      action: 'subscribe',
      changes_after: {
        product_id: payload.product_id,
        service_id: payload.service_id,
      },
    });
    this.logger.debug(
      `audit logged: support_inside.subscribed subscription=${payload.subscription_id}`,
    );
  }

  @OnEvent('support_inside.cancelled')
  async onCancelled(payload: {
    subscription_id: string;
    client_id: string;
    reason: string | null;
    released_slots: number;
  }): Promise<void> {
    await this.audit.logChange({
      user_id: payload.client_id,
      entity_type: 'SupportInsideSubscription',
      entity_id: payload.subscription_id,
      action: 'cancel',
      changes_after: {
        reason: payload.reason,
        released_slots: payload.released_slots,
      },
    });
    this.logger.debug(
      `audit logged: support_inside.cancelled subscription=${payload.subscription_id}`,
    );
  }

  @OnEvent('support_inside.slot_assigned')
  async onSlotAssigned(payload: {
    slot_id: string;
    subscription_id: string;
    client_id: string;
    service_id: string;
    slot_type: string;
    is_extra: boolean;
  }): Promise<void> {
    await this.audit.logChange({
      user_id: payload.client_id,
      entity_type: 'SupportInsideSlot',
      entity_id: payload.slot_id,
      action: 'assign_slot',
      changes_after: {
        subscription_id: payload.subscription_id,
        service_id: payload.service_id,
        slot_type: payload.slot_type,
        is_extra: payload.is_extra,
      },
    });
    this.logger.debug(
      `audit logged: support_inside.slot_assigned slot=${payload.slot_id}`,
    );
  }

  @OnEvent('support_inside.slot_released')
  async onSlotReleased(payload: {
    slot_id: string;
    subscription_id: string;
    client_id: string;
    reason: string;
  }): Promise<void> {
    await this.audit.logChange({
      user_id: payload.client_id,
      entity_type: 'SupportInsideSlot',
      entity_id: payload.slot_id,
      action: 'release_slot',
      changes_after: {
        subscription_id: payload.subscription_id,
        reason: payload.reason,
      },
    });
    this.logger.debug(
      `audit logged: support_inside.slot_released slot=${payload.slot_id}`,
    );
  }

  // Rediseño UI F3·E8 — asignación/reasignación del "técnico asignado".
  @OnEvent('support_inside.technician_assigned')
  async onTechnicianAssigned(payload: {
    subscription_id: string;
    client_id: string;
    technician_id: string | null;
    previous_technician_id: string | null;
    reassigned_pending_tasks: number;
  }): Promise<void> {
    await this.audit.logChange({
      user_id: payload.client_id,
      entity_type: 'SupportInsideSubscription',
      entity_id: payload.subscription_id,
      action: 'assign_technician',
      changes_after: {
        technician_id: payload.technician_id,
        previous_technician_id: payload.previous_technician_id,
        reassigned_pending_tasks: payload.reassigned_pending_tasks,
      },
    });
    this.logger.debug(
      `audit logged: support_inside.technician_assigned subscription=${payload.subscription_id}`,
    );
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { SupportInsideAuditListener } from './support-inside-audit.listener';
import { AuditService } from '../../audit/audit.service';

/**
 * Tests unit SupportInsideAuditListener — Sub-fase 8.D.12.3.
 *
 * Cobertura: cada uno de los 4 eventos canónicos llama a logChange con el
 * shape correcto (entity_type, action, changes_after).
 */
describe('SupportInsideAuditListener — Sprint 8 Fase D.12.3', () => {
  let listener: SupportInsideAuditListener;
  let audit: { logChange: jest.Mock };

  beforeEach(async () => {
    audit = { logChange: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportInsideAuditListener,
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    listener = module.get(SupportInsideAuditListener);
  });

  it('subscribed → logChange con entity_type=SupportInsideSubscription action=subscribe', async () => {
    await listener.onSubscribed({
      subscription_id: 'S1',
      client_id: 'U1',
      product_id: 'P1',
      service_id: 'SV1',
    });
    expect(audit.logChange).toHaveBeenCalledWith({
      user_id: 'U1',
      entity_type: 'SupportInsideSubscription',
      entity_id: 'S1',
      action: 'subscribe',
      changes_after: { product_id: 'P1', service_id: 'SV1' },
    });
  });

  it('cancelled → logChange con action=cancel + reason + released_slots', async () => {
    await listener.onCancelled({
      subscription_id: 'S1',
      client_id: 'U1',
      reason: 'cliente cambia',
      released_slots: 2,
    });
    expect(audit.logChange).toHaveBeenCalledWith({
      user_id: 'U1',
      entity_type: 'SupportInsideSubscription',
      entity_id: 'S1',
      action: 'cancel',
      changes_after: { reason: 'cliente cambia', released_slots: 2 },
    });
  });

  it('slot_assigned → logChange con entity_type=SupportInsideSlot action=assign_slot', async () => {
    await listener.onSlotAssigned({
      slot_id: 'SL1',
      subscription_id: 'S1',
      client_id: 'U1',
      service_id: 'SV1',
      slot_type: 'maintenance',
      is_extra: false,
    });
    expect(audit.logChange).toHaveBeenCalledWith({
      user_id: 'U1',
      entity_type: 'SupportInsideSlot',
      entity_id: 'SL1',
      action: 'assign_slot',
      changes_after: {
        subscription_id: 'S1',
        service_id: 'SV1',
        slot_type: 'maintenance',
        is_extra: false,
      },
    });
  });

  it('slot_released → logChange con action=release_slot + reason', async () => {
    await listener.onSlotReleased({
      slot_id: 'SL1',
      subscription_id: 'S1',
      client_id: 'U1',
      reason: 'manual',
    });
    expect(audit.logChange).toHaveBeenCalledWith({
      user_id: 'U1',
      entity_type: 'SupportInsideSlot',
      entity_id: 'SL1',
      action: 'release_slot',
      changes_after: { subscription_id: 'S1', reason: 'manual' },
    });
  });
});

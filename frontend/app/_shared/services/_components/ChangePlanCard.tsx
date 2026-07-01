'use client';

/**
 * ChangePlanCard — UI cliente del cambio de plan con prorrateo (ADR-029).
 *
 * Card en el detalle de servicio (aside, ruta CLIENTE) con CTA "Cambiar de plan"
 * → `<ChangePlanModal>` (picker de ciclos + **desglose del prorrateo, R5** +
 * confirm). En el detalle ADMIN la acción vive en el menú "Más acciones"
 * (decisión Yasmin F4·U24: sin card, un solo "Cambiar plan…" en el kebab) — por
 * eso el registro `plan-change-card` es `scope: 'client'`.
 *
 * Alcance ADR-029: cambio de **ciclo en el mismo producto** (mensual ↔ anual…).
 */
import { useState } from 'react';

import { Button, SectionCard } from '../../../components/ui';
import { ChangePlanModal } from './ChangePlanModal';
import styles from './ChangePlanCard.module.css';

export function ChangePlanCard({ serviceId }: { serviceId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <SectionCard
      title="Cambiar de plan"
      actions={
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Cambiar de plan
        </Button>
      }
    >
      <p className={styles.hint}>
        Cambia entre mensual y anual. Verás el prorrateo (lo que ya pagaste se
        descuenta) antes de confirmar.
      </p>

      <ChangePlanModal
        serviceId={serviceId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </SectionCard>
  );
}

'use client';

/**
 * AutoRenewToggle — Sprint F4·W3.
 *
 * Control compartido de auto-renovación (invoice-driven, Aelium-side). Lo usan
 * el detalle de servicio (hosting) y el de dominio. Toggle optimista + toast;
 * `router.refresh()` re-sincroniza el SC. El copy explica la consecuencia real
 * de desactivar, distinta por tipo (hosting se suspende / dominio expira).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Toggle, useToast } from '../../components/ui';
import { setAutoRenewAction } from './_actions';
import styles from './auto-renew-toggle.module.css';

type AutoRenewKind = 'service' | 'domain';

const HINT: Record<AutoRenewKind, { on: string; off: string }> = {
  service: {
    on: 'Tu servicio se renueva solo. Te avisamos y facturamos antes de cada vencimiento.',
    off: 'No se renovará: al terminar el periodo pagado, el servicio se suspenderá.',
  },
  domain: {
    on: 'Tu dominio se renueva solo. Te avisamos y facturamos antes de que caduque.',
    off: 'No se renovará: el dominio caducará al llegar su fecha de expiración.',
  },
};

interface Props {
  serviceId: string;
  enabled: boolean;
  kind: AutoRenewKind;
}

export function AutoRenewToggle({ serviceId, enabled, kind }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [checked, setChecked] = useState(enabled);
  const [pending, startTransition] = useTransition();

  const handle = (next: boolean) => {
    setChecked(next); // optimista
    startTransition(async () => {
      const res = await setAutoRenewAction(serviceId, next);
      if (!res.ok) {
        setChecked(!next); // revierte
        toast('error', res.error);
        return;
      }
      setChecked(res.auto_renew);
      toast(
        'success',
        res.auto_renew
          ? 'Auto-renovación activada.'
          : 'Auto-renovación desactivada.',
      );
      router.refresh();
    });
  };

  return (
    <div className={styles.row}>
      <div className={styles.copy}>
        <span className={styles.label}>Auto-renovación</span>
        <span className={styles.hint}>
          {checked ? HINT[kind].on : HINT[kind].off}
        </span>
      </div>
      <Toggle
        checked={checked}
        onChange={handle}
        disabled={pending}
        aria-label="Auto-renovación"
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Button, Input, Modal, Select, useToast } from '../../../components/ui';
import type { ClientDetail } from './types';
import { updateClientProfileAction } from './_actions';
import styles from './clientDetail.module.css';

/* ═══════════════════════════════════════
   ClientEditModal (F4·U22) — edita el perfil del cliente
   (`PATCH /admin/clients/:id`, UpdateClientProfileDto). Modal DS (Nivel 3).
   ═══════════════════════════════════════ */

interface Props {
  client: ClientDetail;
  open: boolean;
  onClose: () => void;
}

const TYPE_OPTIONS = [
  { value: 'individual', label: 'Particular' },
  { value: 'company', label: 'Empresa' },
];

export default function ClientEditModal({ client, open, onClose }: Props) {
  const { toast } = useToast();
  const p = client.client_profile;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    client_type: p?.client_type || 'individual',
    company_name: p?.company_name || '',
    tax_id: p?.tax_id || '',
    phone: p?.phone || '',
    address_line1: p?.address_line1 || '',
    city: p?.city || '',
    postal_code: p?.postal_code || '',
    country: p?.country || 'ES',
    billing_email: p?.billing_email || '',
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true);
    const result = await updateClientProfileAction(client.id, { ...form });
    setSaving(false);
    if (result.ok) {
      toast('success', 'Perfil del cliente actualizado.');
      onClose();
    } else {
      toast('error', result.error);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => (saving ? undefined : onClose())}
      title="Editar perfil del cliente"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSave()} loading={saving}>
            Guardar cambios
          </Button>
        </>
      }
    >
      <div className={styles.editGrid}>
        <label className={styles.editField}>
          <span className={styles.editLabel}>Tipo</span>
          <Select
            value={form.client_type}
            onChange={(e) => set('client_type')(e.target.value)}
            options={TYPE_OPTIONS}
          />
        </label>
        <label className={styles.editField}>
          <span className={styles.editLabel}>Nombre / Razón social</span>
          <Input value={form.company_name} onChange={(e) => set('company_name')(e.target.value)} placeholder="Empresa S.L." />
        </label>
        <label className={styles.editField}>
          <span className={styles.editLabel}>NIF / CIF</span>
          <Input value={form.tax_id} onChange={(e) => set('tax_id')(e.target.value)} placeholder="B-12345678" />
        </label>
        <label className={styles.editField}>
          <span className={styles.editLabel}>Teléfono</span>
          <Input value={form.phone} onChange={(e) => set('phone')(e.target.value)} placeholder="+34 …" />
        </label>
        <label className={`${styles.editField} ${styles.editFull}`}>
          <span className={styles.editLabel}>Dirección</span>
          <Input value={form.address_line1} onChange={(e) => set('address_line1')(e.target.value)} placeholder="Calle …" />
        </label>
        <label className={styles.editField}>
          <span className={styles.editLabel}>Ciudad</span>
          <Input value={form.city} onChange={(e) => set('city')(e.target.value)} />
        </label>
        <label className={styles.editField}>
          <span className={styles.editLabel}>Código postal</span>
          <Input value={form.postal_code} onChange={(e) => set('postal_code')(e.target.value)} />
        </label>
        <label className={styles.editField}>
          <span className={styles.editLabel}>País (ISO-2)</span>
          <Input value={form.country} onChange={(e) => set('country')(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
        </label>
        <label className={styles.editField}>
          <span className={styles.editLabel}>Email de facturación</span>
          <Input value={form.billing_email} onChange={(e) => set('billing_email')(e.target.value)} placeholder="opcional" />
        </label>
      </div>
    </Modal>
  );
}

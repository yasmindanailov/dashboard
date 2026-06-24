'use client';

import { useState } from 'react';

import {
  Card,
  Input,
  Select,
  Button,
  Modal,
  useToast,
} from '../../components/ui';
import {
  createBillingProfileAction,
  updateBillingProfileAction,
  deleteBillingProfileAction,
  setDefaultBillingProfileAction,
  type BillingProfile,
  type BillingProfileInput,
  type BillingProfileType,
} from './_actions';
import styles from './AccountView.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Sección Facturación (ADR-085): CRUD self-service de perfiles de facturación
   (BillingProfile — los que de verdad referencian las facturas, ADR-060 §A).
   ═══════════════════════════════════════════════════════════════════════════ */

const TYPE_OPTIONS = [
  { value: 'personal', label: 'Particular' },
  { value: 'autonomo', label: 'Autónomo' },
  { value: 'empresa', label: 'Empresa' },
];

const TYPE_LABEL: Record<BillingProfileType, string> = {
  personal: 'Particular',
  autonomo: 'Autónomo',
  empresa: 'Empresa',
};

interface FormState {
  type: BillingProfileType;
  label: string;
  first_name: string;
  last_name: string;
  company_name: string;
  nif_cif: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postal_code: string;
  country: string;
}

const EMPTY_FORM: FormState = {
  type: 'personal',
  label: '',
  first_name: '',
  last_name: '',
  company_name: '',
  nif_cif: '',
  address_line1: '',
  address_line2: '',
  city: '',
  postal_code: '',
  country: 'ES',
};

function toForm(p: BillingProfile): FormState {
  return {
    type: p.type,
    label: p.label,
    first_name: p.first_name ?? '',
    last_name: p.last_name ?? '',
    company_name: p.company_name ?? '',
    nif_cif: p.nif_cif ?? '',
    address_line1: p.address_line1,
    address_line2: p.address_line2 ?? '',
    city: p.city,
    postal_code: p.postal_code,
    country: p.country,
  };
}

interface Props {
  initial: BillingProfile[];
}

export default function BillingProfilesPanel({ initial }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<BillingProfile[]>(initial);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BillingProfile | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };
  const openEdit = (p: BillingProfile) => {
    setEditing(p);
    setForm(toForm(p));
    setModalOpen(true);
  };

  const buildInput = (): BillingProfileInput => ({
    type: form.type,
    label: form.label.trim(),
    first_name: form.first_name.trim() || undefined,
    last_name: form.last_name.trim() || undefined,
    company_name: form.company_name.trim() || undefined,
    nif_cif: form.nif_cif.trim() || undefined,
    address_line1: form.address_line1.trim(),
    address_line2: form.address_line2.trim() || undefined,
    city: form.city.trim(),
    postal_code: form.postal_code.trim(),
    country: form.country.trim().toUpperCase() || 'ES',
  });

  const save = async () => {
    if (!form.label.trim() || !form.address_line1.trim() || !form.city.trim() || !form.postal_code.trim()) {
      toast('error', 'Completa etiqueta, dirección, ciudad y código postal.');
      return;
    }
    setBusy(true);
    const input = buildInput();
    const res = editing
      ? await updateBillingProfileAction(editing.id, input)
      : await createBillingProfileAction(input);
    setBusy(false);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    const saved = res.data;
    setItems((prev) =>
      editing
        ? prev.map((p) => (p.id === saved.id ? saved : p))
        : [...prev, saved],
    );
    setModalOpen(false);
    toast('success', editing ? 'Perfil actualizado.' : 'Perfil creado.');
  };

  const makeDefault = async (id: string) => {
    setActingId(id);
    const res = await setDefaultBillingProfileAction(id);
    setActingId(null);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    setItems((prev) => prev.map((p) => ({ ...p, is_default: p.id === id })));
    toast('success', 'Perfil predeterminado actualizado.');
  };

  const remove = async (id: string) => {
    setActingId(id);
    const res = await deleteBillingProfileAction(id);
    setActingId(null);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== id));
    toast('success', 'Perfil eliminado.');
  };

  return (
    <Card>
      <div className={styles.cardHeaderRow}>
        <div>
          <h2 className={styles.sectionTitle}>Perfiles de facturación</h2>
          <p className={styles.sectionHint}>
            Los datos fiscales que aparecen en tus facturas. Marca uno como
            predeterminado.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate}>
          Nuevo perfil
        </Button>
      </div>

      {items.length === 0 ? (
        <p className={styles.empty}>
          Aún no tienes perfiles de facturación. Crea uno para tus facturas.
        </p>
      ) : (
        <div className={styles.billingList}>
          {items.map((p) => (
            <div
              key={p.id}
              className={`${styles.billingItem} ${p.is_default ? styles.billingItemDefault : ''}`}
            >
              <div className={styles.billingInfo}>
                <span className={styles.billingLabel}>
                  {p.label}
                  {p.is_default && (
                    <span className={styles.defaultTag}>Predeterminado</span>
                  )}
                </span>
                <span className={styles.billingType}>
                  {TYPE_LABEL[p.type]}
                  {p.nif_cif ? ` · ${p.nif_cif}` : ''}
                </span>
                <span className={styles.billingAddr}>
                  {p.company_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()}
                  {' · '}
                  {p.address_line1}, {p.postal_code} {p.city} ({p.country})
                </span>
              </div>
              <div className={styles.billingItemActions}>
                <div className={styles.billingActionsRow}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openEdit(p)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={actingId === p.id}
                    disabled={p.is_default}
                    onClick={() => void remove(p.id)}
                  >
                    Eliminar
                  </Button>
                </div>
                {!p.is_default && (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={actingId === p.id}
                    onClick={() => void makeDefault(p.id)}
                  >
                    Hacer predeterminado
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="lg"
        title={editing ? 'Editar perfil de facturación' : 'Nuevo perfil de facturación'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              {editing ? 'Guardar' : 'Crear'}
            </Button>
          </>
        }
      >
        <div className={styles.grid}>
          <Select
            label="Tipo"
            options={TYPE_OPTIONS}
            value={form.type}
            onChange={(e) => set('type')(e.currentTarget.value)}
          />
          <Input
            label="Etiqueta"
            value={form.label}
            onChange={(e) => set('label')(e.target.value)}
            placeholder="Ej. Personal, Mi empresa…"
          />
          <Input
            label="Nombre"
            value={form.first_name}
            onChange={(e) => set('first_name')(e.target.value)}
          />
          <Input
            label="Apellidos"
            value={form.last_name}
            onChange={(e) => set('last_name')(e.target.value)}
          />
          <Input
            label="Razón social"
            value={form.company_name}
            onChange={(e) => set('company_name')(e.target.value)}
            helperText="Obligatoria para tipo empresa."
          />
          <Input
            label="NIF / CIF"
            value={form.nif_cif}
            onChange={(e) => set('nif_cif')(e.target.value)}
            helperText="Obligatorio para autónomo y empresa."
          />
          <Input
            label="Dirección"
            value={form.address_line1}
            onChange={(e) => set('address_line1')(e.target.value)}
            className={styles.full}
          />
          <Input
            label="Dirección (línea 2)"
            value={form.address_line2}
            onChange={(e) => set('address_line2')(e.target.value)}
            className={styles.full}
          />
          <Input
            label="Ciudad"
            value={form.city}
            onChange={(e) => set('city')(e.target.value)}
          />
          <Input
            label="Código postal"
            value={form.postal_code}
            onChange={(e) => set('postal_code')(e.target.value)}
          />
          <Input
            label="País (ISO-2)"
            value={form.country}
            onChange={(e) => set('country')(e.target.value)}
            maxLength={2}
          />
        </div>
      </Modal>
    </Card>
  );
}

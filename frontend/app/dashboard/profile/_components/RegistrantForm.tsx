'use client';

import { useState } from 'react';

import {
  AlertBanner,
  Button,
  Card,
  Input,
  useToast,
} from '../../../components/ui';
import {
  updateRegistrantAction,
  type RegistrantProfile,
  type RegistrantSyncStatus,
} from '../../../_shared/domains/_registrant-actions';

/* ═══════════════════════════════════════════════════════════════════════════
   RegistrantForm — Sprint 15D Fase 15D.G·2.

   Datos de titular (WHOIS) del cliente. Son 1 por cliente (ADR-081 A2): al
   guardarlos se propagan al registrar → todos sus dominios. Avisa si el cambio
   de nombre puede implicar verificación + lock ICANN de 60 días.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  initial: RegistrantProfile;
}

type FormState = Omit<RegistrantProfile, 'email'>;

export default function RegistrantForm({ initial }: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>({
    first_name: initial.first_name,
    last_name: initial.last_name,
    company_name: initial.company_name,
    tax_id: initial.tax_id,
    phone: initial.phone,
    address_line1: initial.address_line1,
    address_line2: initial.address_line2,
    city: initial.city,
    state: initial.state,
    postal_code: initial.postal_code,
    country: initial.country,
  });
  const [saving, setSaving] = useState(false);
  const [sync, setSync] = useState<RegistrantSyncStatus | null>(null);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    setSync(null);
    const res = await updateRegistrantAction({
      first_name: form.first_name ?? '',
      last_name: form.last_name ?? '',
      company_name: form.company_name ?? '',
      tax_id: form.tax_id ?? '',
      phone: form.phone ?? '',
      address_line1: form.address_line1 ?? '',
      address_line2: form.address_line2 ?? '',
      city: form.city ?? '',
      state: form.state ?? '',
      postal_code: form.postal_code ?? '',
      country: (form.country ?? '').toUpperCase(),
    });
    setSaving(false);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    setSync(res.data.registrarSync);
    toast('success', 'Datos de titular guardados.');
  };

  return (
    <Card>
      <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>
        Datos de titular (WHOIS)
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 16px' }}>
        Estos datos identifican al titular de <strong>todos tus dominios</strong>
        ante el registrador. Al guardarlos se actualizan en todos ellos.
      </p>

      {sync?.error && (
        <div style={{ marginBottom: 12 }}>
          <AlertBanner variant="warning">
            Perfil guardado, pero no se pudo sincronizar con el registrador:{' '}
            {sync.error}
          </AlertBanner>
        </div>
      )}
      {sync?.propagated && sync.nameChanged && (
        <div style={{ marginBottom: 12 }}>
          <AlertBanner variant="warning">
            Has cambiado el <strong>nombre del titular</strong>. En algunos TLDs
            esto puede requerir verificación por email y bloquea la transferencia
            del dominio durante 60 días (política ICANN).
          </AlertBanner>
        </div>
      )}
      {sync?.propagated && !sync.nameChanged && sync.domainsAffected > 0 && (
        <div style={{ marginBottom: 12 }}>
          <AlertBanner variant="success">
            Sincronizado con el registrador en {sync.domainsAffected}{' '}
            {sync.domainsAffected === 1 ? 'dominio' : 'dominios'}.
          </AlertBanner>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 16,
        }}
      >
        <Input
          label="Nombre"
          value={form.first_name ?? ''}
          onChange={(e) => set('first_name')(e.target.value)}
        />
        <Input
          label="Apellidos"
          value={form.last_name ?? ''}
          onChange={(e) => set('last_name')(e.target.value)}
        />
        <Input label="Email" value={initial.email} disabled />
        <Input
          label="Empresa (opcional)"
          value={form.company_name ?? ''}
          onChange={(e) => set('company_name')(e.target.value)}
        />
        <Input
          label="NIF / CIF / Tax ID"
          value={form.tax_id ?? ''}
          onChange={(e) => set('tax_id')(e.target.value)}
          helperText="Requerido para .es y otros TLDs regulados."
        />
        <Input
          label="Teléfono"
          value={form.phone ?? ''}
          onChange={(e) => set('phone')(e.target.value)}
        />
        <Input
          label="Dirección"
          value={form.address_line1 ?? ''}
          onChange={(e) => set('address_line1')(e.target.value)}
        />
        <Input
          label="Dirección (línea 2)"
          value={form.address_line2 ?? ''}
          onChange={(e) => set('address_line2')(e.target.value)}
        />
        <Input
          label="Ciudad"
          value={form.city ?? ''}
          onChange={(e) => set('city')(e.target.value)}
        />
        <Input
          label="Provincia / Estado"
          value={form.state ?? ''}
          onChange={(e) => set('state')(e.target.value)}
        />
        <Input
          label="Código postal"
          value={form.postal_code ?? ''}
          onChange={(e) => set('postal_code')(e.target.value)}
        />
        <Input
          label="País (ISO-2)"
          value={form.country ?? ''}
          onChange={(e) => set('country')(e.target.value)}
          maxLength={2}
          helperText="Código de 2 letras, ej. ES."
        />
      </div>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          Guardar datos de titular
        </Button>
      </div>
    </Card>
  );
}

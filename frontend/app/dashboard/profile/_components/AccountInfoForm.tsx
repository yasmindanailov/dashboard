'use client';

import { useState } from 'react';

import { Card, Input, Select, Button, useToast } from '../../../components/ui';
import { updateAccountProfileAction, type AccountMe } from '../_actions';
import styles from './AccountView.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   Sección Cuenta — identidad propia (ADR-085). NO toca el registrar de dominios
   (a diferencia de la sección Dominios/WHOIS). El email es read-only.
   ═══════════════════════════════════════════════════════════════════════════ */

const LANGUAGES = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
];

const COMMON_TIMEZONES = [
  'Europe/Madrid',
  'Atlantic/Canary',
  'Europe/London',
  'Europe/Lisbon',
  'Europe/Paris',
  'America/New_York',
  'America/Mexico_City',
  'America/Argentina/Buenos_Aires',
  'UTC',
];

interface Props {
  me: AccountMe;
}

export default function AccountInfoForm({ me }: Props) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState(me.first_name);
  const [lastName, setLastName] = useState(me.last_name);
  const [language, setLanguage] = useState(me.language);
  const [timezone, setTimezone] = useState(me.timezone);
  const [saving, setSaving] = useState(false);

  const tzList = COMMON_TIMEZONES.includes(timezone)
    ? COMMON_TIMEZONES
    : [timezone, ...COMMON_TIMEZONES];
  const tzOptions = tzList.map((t) => ({ value: t, label: t }));

  const save = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      toast('error', 'El nombre y los apellidos son obligatorios.');
      return;
    }
    setSaving(true);
    const res = await updateAccountProfileAction({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      language,
      timezone,
    });
    setSaving(false);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    toast('success', 'Perfil actualizado.');
  };

  return (
    <Card>
      <h2 className={styles.sectionTitle}>Datos de la cuenta</h2>
      <p className={styles.sectionHint}>
        Tu nombre, idioma y zona horaria. El email no se cambia desde aquí.
      </p>

      <div className={styles.grid}>
        <Input
          label="Nombre"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <Input
          label="Apellidos"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
        <Input
          label="Email"
          value={me.email}
          disabled
          helperText={me.email_verified_at ? 'Verificado' : 'Sin verificar'}
        />
        <Input label="Rol" value={me.role.name} disabled />
        <Select
          label="Idioma"
          options={LANGUAGES}
          value={language}
          onChange={(e) => setLanguage(e.currentTarget.value)}
        />
        <Select
          label="Zona horaria"
          options={tzOptions}
          value={timezone}
          onChange={(e) => setTimezone(e.currentTarget.value)}
        />
      </div>

      <div className={styles.actions}>
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          Guardar cambios
        </Button>
      </div>
    </Card>
  );
}

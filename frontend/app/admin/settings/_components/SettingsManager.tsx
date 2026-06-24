'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  AlertBanner,
  Button,
  Card,
  Input,
  Select,
  Textarea,
  useToast,
} from '../../../components/ui';
import { saveSettingsAction, type SettingChange } from '../_actions';
import { LogoUploader } from './LogoUploader';

export interface AdminSettingView {
  category: string;
  key: string;
  type: string;
  label: string;
  description: string;
  group: string;
  editable: boolean;
  managed: boolean;
  options?: string[];
  min?: number;
  max?: number;
  value: unknown;
}

export interface AdminSettingsGroup {
  group: string;
  settings: AdminSettingView[];
}

interface SettingsManagerProps {
  groups: AdminSettingsGroup[];
  initialLogoUrl: string | null;
  error: string | null;
}

/** Convierte el valor crudo de un setting a su representación de formulario. */
function toFormValue(setting: AdminSettingView): string {
  const v = setting.value;
  if (v === null || v === undefined) return '';
  if (setting.type === 'boolean') return v === true || v === 'true' ? 'true' : 'false';
  if (setting.type === 'string[]') {
    return Array.isArray(v) ? v.join('\n') : String(v);
  }
  return String(v);
}

/** Convierte la representación de formulario al valor que espera el backend. */
function fromFormValue(setting: AdminSettingView, formValue: string): unknown {
  switch (setting.type) {
    case 'number':
      return formValue.trim() === '' ? '' : Number(formValue);
    case 'boolean':
      return formValue === 'true';
    case 'string[]':
      return formValue
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    default:
      return formValue;
  }
}

export function SettingsManager({
  groups,
  initialLogoUrl,
  error,
}: SettingsManagerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
          Configuración
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          Reglas de negocio, marca e integraciones. Sólo el superadmin puede
          editar estos valores.
        </p>
      </header>

      {error && (
        <AlertBanner variant="danger" title="No se pudo cargar la configuración">
          {error}
        </AlertBanner>
      )}

      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
              Plugins de provisioning
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Activar, configurar y probar los plugins (hosting, dominios…).
            </p>
          </div>
          <Link href="/admin/settings/plugins">
            <Button variant="secondary" size="sm">
              Gestionar plugins
            </Button>
          </Link>
        </div>
      </Card>

      {groups.map((group) => (
        <SettingGroupForm
          key={group.group}
          group={group}
          initialLogoUrl={initialLogoUrl}
        />
      ))}
    </div>
  );
}

function SettingGroupForm({
  group,
  initialLogoUrl,
}: {
  group: AdminSettingsGroup;
  initialLogoUrl: string | null;
}) {
  const { toast } = useToast();
  const initial = useMemo(() => {
    const out: Record<string, string> = {};
    for (const s of group.settings) out[s.key] = toFormValue(s);
    return out;
  }, [group]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);

  const editable = group.settings.filter((s) => s.editable && !s.managed);

  async function handleSave(): Promise<void> {
    const changes: SettingChange[] = editable
      .filter((s) => values[s.key] !== initial[s.key])
      .map((s) => ({
        category: s.category,
        key: s.key,
        value: fromFormValue(s, values[s.key]),
      }));

    if (changes.length === 0) {
      toast('info', 'No hay cambios que guardar.');
      return;
    }

    setSaving(true);
    try {
      const res = await saveSettingsAction(changes);
      if (res.ok) toast('success', `Sección «${group.group}» guardada.`);
      else toast('error', res.error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{group.group}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {group.settings.map((setting) => (
            <SettingField
              key={setting.key}
              setting={setting}
              value={values[setting.key]}
              onChange={(v) =>
                setValues((prev) => ({ ...prev, [setting.key]: v }))
              }
              initialLogoUrl={initialLogoUrl}
            />
          ))}
        </div>
        <div>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            onClick={() => void handleSave()}
          >
            Guardar
          </Button>
        </div>
      </section>
    </Card>
  );
}

function SettingField({
  setting,
  value,
  onChange,
  initialLogoUrl,
}: {
  setting: AdminSettingView;
  value: string;
  onChange: (v: string) => void;
  initialLogoUrl: string | null;
}) {
  // Logo gestionado → componente dedicado de subida.
  if (setting.managed && setting.key === 'logo_key') {
    return <LogoUploader initialUrl={initialLogoUrl} />;
  }

  if (setting.type === 'boolean') {
    return (
      <Select
        label={setting.label}
        helperText={setting.description}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={[
          { value: 'true', label: 'Activado' },
          { value: 'false', label: 'Desactivado' },
        ]}
      />
    );
  }

  if (setting.type === 'enum') {
    return (
      <Select
        label={setting.label}
        helperText={setting.description}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={(setting.options ?? []).map((o) => ({ value: o, label: o }))}
      />
    );
  }

  if (setting.type === 'string[]') {
    return (
      <Textarea
        label={setting.label}
        helperText={`${setting.description} (un valor por línea)`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    );
  }

  if (setting.type === 'color') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <Input
              label={setting.label}
              helperText={setting.description}
              value={value}
              placeholder="#1a1a1a"
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
          <input
            type="color"
            aria-label={`${setting.label} (selector)`}
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: 40,
              height: 38,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'transparent',
              cursor: 'pointer',
            }}
          />
        </div>
      </div>
    );
  }

  if (setting.type === 'number') {
    const range =
      setting.min !== undefined && setting.max !== undefined
        ? `${setting.description} (entre ${setting.min} y ${setting.max})`
        : setting.description;
    return (
      <Input
        type="number"
        label={setting.label}
        helperText={range}
        value={value}
        min={setting.min}
        max={setting.max}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // string (default)
  return (
    <Input
      label={setting.label}
      helperText={setting.description}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

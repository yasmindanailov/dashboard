'use client';

import { useState, useTransition } from 'react';

import {
  AlertBanner,
  Button,
  Input,
  Modal,
  Select,
} from '../../../../../components/ui';
import {
  DNS_RECORD_KINDS_V1,
  type DnsRecord,
  type DnsRecordKindV1,
} from '../../../../../lib/api';
import {
  createDnsRecordAction,
  updateDnsRecordAction,
} from '../../../../../_shared/services/dns/_actions';

/* ═══════════════════════════════════════════════════════════════════════════
   DnsRecordForm — Sprint 15C Fase 15C.G (ADR-082 §6 + ADR-083 §5).

   Modal con form para crear/editar un DNS record. Usa DS components
   estándar (Select/Input) — la doctrina rjsf solo aplica donde el plugin
   declara `productConfigSchema`/`configSchema` declarativo (Sprint 15A
   plugin install + Fase E.2 productos). Aquí el schema es plano y la
   UX necesita helper-text contextual por `kind`, así que rjsf no aporta.

   Validación form-side (UX antes de POST):
     - kind ∈ DNS_RECORD_KINDS_V1 (7 kinds canónicos).
     - name: 1-255 chars, no vacío.
     - value: 1-4096 chars, no vacío.
     - ttl (opcional): 60-86400.
     - proxy (opcional): boolean.
   Defense-in-depth backend: class-validator (DTO) + Ajv (plugin
   payloadSchema) revalida.
   ═══════════════════════════════════════════════════════════════════════════ */

interface CreateProps {
  mode: 'create';
  serviceId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface EditProps {
  mode: 'edit';
  serviceId: string;
  record: DnsRecord;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Props = CreateProps | EditProps;

/**
 * Helper-text contextual por kind. Aelium NO valida el shape específico
 * del `value` (eso lo hace Enhance al recibirlo); aquí solo guiamos al
 * cliente con ejemplos canónicos para reducir errores 422 del proveedor.
 */
const KIND_HELPER: Record<DnsRecordKindV1, string> = {
  A: 'Dirección IPv4. Ejemplo: 192.0.2.42',
  AAAA: 'Dirección IPv6. Ejemplo: 2001:db8::1',
  CNAME:
    'Hostname destino con punto final. Ejemplo: midominio.com. (no permitido en @)',
  MX:
    'Hostname del servidor de correo. Ejemplo: mail.midominio.com (priority en value separado por espacio)',
  TXT:
    'Texto libre entre comillas. Ejemplo: "v=spf1 include:_spf.google.com ~all"',
  SRV:
    'Formato: priority weight port target. Ejemplo: 10 60 5060 sip.midominio.com.',
  CAA:
    'Formato: flag tag value. Ejemplo: 0 issue "letsencrypt.org"',
};

const KIND_NAME_HELPER: Record<DnsRecordKindV1, string> = {
  A: 'Subdominio o "@" para el apex.',
  AAAA: 'Subdominio o "@" para el apex.',
  CNAME: 'Subdominio (NO se admite "@" en CNAME — usa A/AAAA en el apex).',
  MX: '"@" para el dominio principal o subdominio si necesitas mail aparte.',
  TXT: '"@" para SPF/DMARC del apex, "_dmarc" para política DMARC, etc.',
  SRV: 'Formato canónico: _service._proto.subdominio (ej. _sip._tcp).',
  CAA: '"@" para política CAA del apex.',
};

const KIND_OPTIONS = DNS_RECORD_KINDS_V1.map((k) => ({ value: k, label: k }));

const DEFAULT_TTL = 3600;

export function DnsRecordForm(props: Props) {
  const isEdit = props.mode === 'edit';
  const initial = isEdit
    ? props.record
    : { kind: 'A' as DnsRecordKindV1, name: '', value: '', ttl: undefined, proxy: false };

  const [kind, setKind] = useState<DnsRecordKindV1>(initial.kind);
  const [name, setName] = useState<string>(initial.name);
  const [value, setValue] = useState<string>(initial.value);
  const [ttl, setTtl] = useState<string>(
    initial.ttl !== undefined ? String(initial.ttl) : '',
  );
  const [proxy, setProxy] = useState<boolean>(initial.proxy ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function reset(): void {
    setKind(initial.kind);
    setName(initial.name);
    setValue(initial.value);
    setTtl(initial.ttl !== undefined ? String(initial.ttl) : '');
    setProxy(initial.proxy ?? false);
    setError(null);
  }

  function close(): void {
    reset();
    props.onClose();
  }

  function validate(): string | null {
    if (!name.trim() || name.trim().length > 255) {
      return 'El nombre es obligatorio (máximo 255 caracteres).';
    }
    if (!value.trim() || value.trim().length > 4096) {
      return 'El valor es obligatorio (máximo 4096 caracteres).';
    }
    if (ttl) {
      const n = Number(ttl);
      if (!Number.isInteger(n) || n < 60 || n > 86400) {
        return 'TTL debe ser un entero entre 60 y 86400 segundos.';
      }
    }
    if (kind === 'CNAME' && name.trim() === '@') {
      return 'No se admite CNAME en el apex (@). Usa un record A/AAAA.';
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);

    const ttlValue = ttl ? Number(ttl) : undefined;

    if (isEdit) {
      // PATCH parcial: enviamos sólo los campos modificados (defense-in-depth
      // contra updates accidentales). El backend acepta partial body.
      const patch: Record<string, unknown> = {};
      if (kind !== props.record.kind) patch.kind = kind;
      if (name.trim() !== props.record.name) patch.name = name.trim();
      if (value.trim() !== props.record.value) patch.value = value.trim();
      if (ttlValue !== props.record.ttl) patch.ttl = ttlValue;
      if (proxy !== props.record.proxy) patch.proxy = proxy;

      if (Object.keys(patch).length === 0) {
        setSaving(false);
        setError('No has cambiado ningún campo.');
        return;
      }

      startTransition(async () => {
        const result = await updateDnsRecordAction(
          props.serviceId,
          props.record.id,
          patch,
        );
        setSaving(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        props.onSaved();
        close();
      });
      return;
    }

    // CREATE
    startTransition(async () => {
      const result = await createDnsRecordAction(props.serviceId, {
        kind,
        name: name.trim(),
        value: value.trim(),
        ttl: ttlValue,
        proxy,
      });
      setSaving(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      props.onSaved();
      close();
    });
  }

  return (
    <Modal
      open={props.open}
      onClose={close}
      title={isEdit ? 'Editar record DNS' : 'Crear record DNS'}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="dns-record-form"
            disabled={saving}
            loading={saving}
          >
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear record'}
          </Button>
        </>
      }
    >
      <form
        id="dns-record-form"
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {error && (
          <AlertBanner variant="danger" onClose={() => setError(null)}>
            {error}
          </AlertBanner>
        )}

        <Select
          label="Tipo *"
          value={kind}
          onChange={(e) => setKind(e.target.value as DnsRecordKindV1)}
          options={KIND_OPTIONS}
          helperText="7 tipos soportados v1. SPF/NS/PTR/DS no se exponen al cliente."
          disabled={isEdit}
        />

        <Input
          label="Nombre *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='@ (apex) o subdominio'
          maxLength={255}
          helperText={KIND_NAME_HELPER[kind]}
        />

        <Input
          label="Valor *"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={4096}
          helperText={KIND_HELPER[kind]}
        />

        <Input
          label="TTL (segundos)"
          type="number"
          min="60"
          max="86400"
          value={ttl}
          onChange={(e) => setTtl(e.target.value)}
          placeholder={String(DEFAULT_TTL)}
          helperText="Entre 60 y 86400 segundos. Vacío = TTL por defecto del proveedor."
        />

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={proxy}
            onChange={(e) => setProxy(e.target.checked)}
          />
          <span>
            Proxy del proveedor activo
            <span
              style={{
                marginLeft: 6,
                fontSize: 12,
                color: 'var(--text-tertiary)',
              }}
            >
              (Cloudflare-style — solo aplica si el proveedor lo soporta)
            </span>
          </span>
        </label>
      </form>
    </Modal>
  );
}

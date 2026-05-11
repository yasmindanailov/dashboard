'use client';

import { useState, useTransition } from 'react';

import {
  AlertBanner,
  Button,
  Input,
  Modal,
  Select,
} from '../../../../components/ui';
import {
  DNS_RECORD_KINDS_V1,
  type DnsRecord,
  type DnsRecordKindV1,
} from '../../../../lib/api';
import { createDnsRecordAction, updateDnsRecordAction } from '../_actions';

/* ═══════════════════════════════════════════════════════════════════════════
   DnsRecordForm — Sprint 15C Fase 15C.G (ADR-082 §6 + ADR-083 §5).
   Sprint 15C.II Fase E: movido a `_shared/services/dns/_components/` +
   compartido cliente/admin (`isAdmin` prop) + gold-standard hardening:
     - TTL como dropdown de presets + opción "Personalizado…" (en vez de
       number crudo) — UX estándar Cloudflare / Route 53.
     - Validación client-side por `kind` (formato del `value`): atrapa el
       error antes del 422 del proveedor. Defense-in-depth — backend
       revalida con class-validator (DTO) + Ajv (plugin payloadSchema).
     - Detección de duplicados (mismo kind+name+value) y conflicto CNAME
       (RFC 1034 §3.6.2 — CNAME no coexiste con otros tipos en el mismo name).

   Modal con form para crear/editar un DNS record. Usa DS components
   estándar (Select/Input) — la doctrina rjsf solo aplica donde el plugin
   declara schemas declarativos (Sprint 15A). Aquí el schema es plano y la
   UX necesita helper-text contextual por `kind`, así que rjsf no aporta.
   ═══════════════════════════════════════════════════════════════════════════ */

interface BaseProps {
  serviceId: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** `true` cuando se renderiza en `/admin/services/[id]/dns` (path admin). */
  isAdmin?: boolean;
  /** Records existentes en la zona — para detección de duplicados/conflictos. */
  existingRecords: readonly DnsRecord[];
}

interface CreateProps extends BaseProps {
  mode: 'create';
}

interface EditProps extends BaseProps {
  mode: 'edit';
  record: DnsRecord;
}

type Props = CreateProps | EditProps;

/**
 * Helper-text contextual por kind. Aelium NO valida el shape específico del
 * `value` exhaustivamente (eso lo hace el proveedor); aquí guiamos al usuario
 * con ejemplos canónicos para reducir errores 422.
 */
const KIND_HELPER: Record<DnsRecordKindV1, string> = {
  A: 'Dirección IPv4. Ejemplo: 192.0.2.42',
  AAAA: 'Dirección IPv6. Ejemplo: 2001:db8::1',
  CNAME: 'Hostname destino. Ejemplo: midominio.com (no permitido en el apex "@")',
  MX: 'Formato: "prioridad hostname". Ejemplo: 10 mail.midominio.com',
  TXT: 'Texto libre entre comillas. Ejemplo: "v=spf1 include:_spf.google.com ~all"',
  SRV: 'Formato: "prioridad peso puerto destino". Ejemplo: 10 60 5060 sip.midominio.com',
  CAA: 'Formato: "flag tag valor". Ejemplo: 0 issue "letsencrypt.org"',
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

// TTL presets canónicos (segundos). "" = TTL por defecto del proveedor.
// "custom" = number input. El proveedor acepta 60..86400.
const TTL_PRESETS: { value: string; label: string }[] = [
  { value: '', label: 'Por defecto del proveedor' },
  { value: '300', label: '5 minutos (300 s)' },
  { value: '1800', label: '30 minutos (1800 s)' },
  { value: '3600', label: '1 hora (3600 s)' },
  { value: '14400', label: '4 horas (14400 s)' },
  { value: '43200', label: '12 horas (43200 s)' },
  { value: '86400', label: '24 horas (86400 s)' },
  { value: 'custom', label: 'Personalizado…' },
];

const TTL_MIN = 60;
const TTL_MAX = 86400;

const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
// IPv6 laxa — acepta forma comprimida `::`. No exhaustiva RFC 4291 (el
// proveedor hace la validación final); rechaza basura obvia.
const IPV6_RE = /^[0-9a-fA-F:]+$/;
const HOSTNAME_RE =
  /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\.?$/;

/**
 * Validación client-side del `value` según el `kind`. Devuelve mensaje de
 * error o `null` si pasa. Defense-in-depth: el backend (class-validator +
 * Ajv del plugin + el proveedor) revalida — esto es UX para feedback inmediato.
 */
function validateValueForKind(
  kind: DnsRecordKindV1,
  rawValue: string,
): string | null {
  const value = rawValue.trim();
  switch (kind) {
    case 'A':
      return IPV4_RE.test(value)
        ? null
        : 'Un record A necesita una IPv4 válida (ej. 192.0.2.42).';
    case 'AAAA':
      return IPV6_RE.test(value) && value.includes(':')
        ? null
        : 'Un record AAAA necesita una IPv6 válida (ej. 2001:db8::1).';
    case 'CNAME':
      return HOSTNAME_RE.test(value)
        ? null
        : 'Un record CNAME necesita un hostname válido (ej. midominio.com).';
    case 'MX': {
      const parts = value.split(/\s+/);
      if (parts.length !== 2) {
        return 'Un record MX necesita "prioridad hostname" (ej. 10 mail.midominio.com).';
      }
      const prio = Number(parts[0]);
      if (!Number.isInteger(prio) || prio < 0 || prio > 65535) {
        return 'La prioridad del MX debe ser un entero entre 0 y 65535.';
      }
      if (!HOSTNAME_RE.test(parts[1])) {
        return 'El hostname del MX no parece válido (ej. mail.midominio.com).';
      }
      return null;
    }
    case 'SRV': {
      const parts = value.split(/\s+/);
      if (parts.length !== 4) {
        return 'Un record SRV necesita "prioridad peso puerto destino" (4 valores).';
      }
      const [p, w, port] = parts.map(Number);
      if (![p, w, port].every((n) => Number.isInteger(n) && n >= 0 && n <= 65535)) {
        return 'prioridad, peso y puerto del SRV deben ser enteros 0..65535.';
      }
      if (!HOSTNAME_RE.test(parts[3])) {
        return 'El destino del SRV no parece un hostname válido.';
      }
      return null;
    }
    case 'CAA': {
      const parts = value.split(/\s+/);
      if (parts.length < 3) {
        return 'Un record CAA necesita "flag tag valor" (ej. 0 issue "letsencrypt.org").';
      }
      const flag = Number(parts[0]);
      if (!Number.isInteger(flag) || (flag !== 0 && flag !== 128)) {
        return 'El flag del CAA debe ser 0 o 128.';
      }
      if (!['issue', 'issuewild', 'iodef'].includes(parts[1])) {
        return 'El tag del CAA debe ser issue, issuewild o iodef.';
      }
      return null;
    }
    case 'TXT':
      return value.length > 0 && value.length <= 4096
        ? null
        : 'El valor del TXT no puede estar vacío (máx 4096 caracteres).';
    default:
      return null;
  }
}

export function DnsRecordForm(props: Props) {
  const isEdit = props.mode === 'edit';
  const initial = isEdit
    ? props.record
    : {
        kind: 'A' as DnsRecordKindV1,
        name: '',
        value: '',
        ttl: undefined as number | undefined,
        proxy: false,
      };
  const initialTtlSelect =
    initial.ttl === undefined
      ? ''
      : TTL_PRESETS.some((p) => p.value === String(initial.ttl))
        ? String(initial.ttl)
        : 'custom';

  const [kind, setKind] = useState<DnsRecordKindV1>(initial.kind);
  const [name, setName] = useState<string>(initial.name);
  const [value, setValue] = useState<string>(initial.value);
  const [ttlSelect, setTtlSelect] = useState<string>(initialTtlSelect);
  const [ttlCustom, setTtlCustom] = useState<string>(
    initial.ttl !== undefined ? String(initial.ttl) : '',
  );
  const [proxy, setProxy] = useState<boolean>(initial.proxy ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function resolveTtl(): number | undefined {
    if (ttlSelect === '') return undefined;
    if (ttlSelect === 'custom') {
      const n = Number(ttlCustom);
      return Number.isFinite(n) ? n : undefined;
    }
    return Number(ttlSelect);
  }

  function reset(): void {
    setKind(initial.kind);
    setName(initial.name);
    setValue(initial.value);
    setTtlSelect(initialTtlSelect);
    setTtlCustom(initial.ttl !== undefined ? String(initial.ttl) : '');
    setProxy(initial.proxy ?? false);
    setError(null);
  }

  function close(): void {
    reset();
    props.onClose();
  }

  function validate(): string | null {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 255) {
      return 'El nombre es obligatorio (máximo 255 caracteres).';
    }
    if (!value.trim() || value.trim().length > 4096) {
      return 'El valor es obligatorio (máximo 4096 caracteres).';
    }
    if (kind === 'CNAME' && trimmedName === '@') {
      return 'No se admite CNAME en el apex (@). Usa un record A/AAAA.';
    }
    const kindErr = validateValueForKind(kind, value);
    if (kindErr) return kindErr;
    if (ttlSelect === 'custom') {
      const n = Number(ttlCustom);
      if (!Number.isInteger(n) || n < TTL_MIN || n > TTL_MAX) {
        return `TTL debe ser un entero entre ${TTL_MIN} y ${TTL_MAX} segundos.`;
      }
    }
    // Duplicados / conflictos (UX — el backend hace dedup canónica).
    const others = isEdit
      ? props.existingRecords.filter((r) => r.id !== props.record.id)
      : props.existingRecords;
    if (
      others.some(
        (r) =>
          r.kind === kind &&
          r.name === trimmedName &&
          r.value.trim() === value.trim(),
      )
    ) {
      return 'Ya existe un record idéntico (mismo tipo, nombre y valor) en esta zona.';
    }
    if (kind === 'CNAME' && others.some((r) => r.name === trimmedName)) {
      return `No puede haber un CNAME en "${trimmedName}" si ya hay otros records con ese nombre. Elimina los demás primero.`;
    }
    if (
      kind !== 'CNAME' &&
      others.some((r) => r.kind === 'CNAME' && r.name === trimmedName)
    ) {
      return `Ya hay un CNAME en "${trimmedName}" — no puede coexistir con otros tipos. Cámbialo o usa otro nombre.`;
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

    const ttlValue = resolveTtl();
    const trimmedName = name.trim();
    const trimmedValue = value.trim();
    const asAdmin = props.isAdmin ?? false;

    if (isEdit) {
      const patch: Record<string, unknown> = {};
      if (kind !== props.record.kind) patch.kind = kind;
      if (trimmedName !== props.record.name) patch.name = trimmedName;
      if (trimmedValue !== props.record.value) patch.value = trimmedValue;
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
          asAdmin,
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

    startTransition(async () => {
      const result = await createDnsRecordAction(
        props.serviceId,
        {
          kind,
          name: trimmedName,
          value: trimmedValue,
          ttl: ttlValue,
          proxy,
        },
        asAdmin,
      );
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
          onChange={(e) => {
            setKind(e.target.value as DnsRecordKindV1);
            setError(null);
          }}
          options={KIND_OPTIONS}
          helperText="7 tipos soportados v1. SPF/NS/PTR/DS no se exponen aquí."
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

        <Select
          label="TTL"
          value={ttlSelect}
          onChange={(e) => setTtlSelect(e.target.value)}
          options={TTL_PRESETS}
          helperText="Tiempo que los resolvers cachean el record. Más bajo = cambios más rápidos, más consultas."
        />

        {ttlSelect === 'custom' && (
          <Input
            label="TTL personalizado (segundos) *"
            type="number"
            min={String(TTL_MIN)}
            max={String(TTL_MAX)}
            value={ttlCustom}
            onChange={(e) => setTtlCustom(e.target.value)}
            placeholder="3600"
            helperText={`Entre ${TTL_MIN} y ${TTL_MAX} segundos.`}
          />
        )}

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

/**
 * Catálogo canónico de settings editables — Sprint 12 (ADR-044, Amendment A1).
 *
 * Única fuente de verdad de QUÉ settings puede editar el superadmin desde
 * `/admin/settings` y CÓMO se validan (ADR-044 §Validación). El backend valida
 * contra este catálogo antes de persistir; el frontend lo consume (vía
 * `GET /admin/settings`) para pintar el formulario tipado por sección.
 *
 * **Convención de almacenamiento (importante).** Los valores se guardan CRUDOS
 * en `settings.value` (jsonb) — el shape que leen `SettingsService.get` /
 * `getNumber` / `getBoolean` / `getJson`. NO se envuelven en `{ value: ... }`:
 * esa fue una convención muerta de `billing-calculator.getSettingValue` y
 * `invoice-pdf.getCompanyInfo` que leía `(value as {value}).value` → siempre
 * `undefined` → siempre caía al default (corregido en Sprint 12, fase 12.B).
 *
 * Settings NO catalogados aquí (`auth.*`, `jobs.*`, `storage.*`, `audit.*`,
 * `tasks.unassigned_sla_hours.*`, secrets) son operativos/sensibles y NO se
 * exponen al PATCH admin en v1 — sólo se tocan vía seed/código.
 */

export type SettingValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'color'
  | 'string[]';

export interface SettingCatalogEntry {
  category: string;
  key: string;
  type: SettingValueType;
  label: string;
  description: string;
  /** Sección visible en `/admin/settings`. */
  group: string;
  /** Si `false`, se muestra read-only y el PATCH lo rechaza. */
  editable: boolean;
  /**
   * Gestionado por un endpoint dedicado (p.ej. subida de logo), no por el PATCH
   * de texto libre. El PATCH genérico lo rechaza. (Sprint 12.B: `branding.logo_key`.)
   */
  managed?: boolean;
  /** number: límites inclusivos. */
  min?: number;
  max?: number;
  /** number: exige entero. */
  integer?: boolean;
  /** string: longitud máxima (por defecto 200). */
  maxLength?: number;
  /** enum: valores permitidos. */
  options?: readonly string[];
}

/**
 * El valor canónico ya coercido y validado, listo para persistir crudo.
 */
export type SettingValue = string | number | boolean | string[];

/**
 * Catálogo v1. Sólo settings que EXISTEN (seedeados) o que se introducen en
 * este sprint (`branding.*`, fase 12.B). No catalogar settings inexistentes:
 * crearía filas muertas.
 */
export const SETTINGS_CATALOG: readonly SettingCatalogEntry[] = [
  // ── General ──
  {
    category: 'general',
    key: 'default_currency',
    type: 'enum',
    options: ['EUR', 'USD', 'GBP'],
    label: 'Moneda por defecto',
    description: 'Moneda usada por defecto en productos y facturas.',
    group: 'General',
    editable: true,
  },

  // ── Marca ── (Sprint 12 — ADR-044 Amendment A1)
  {
    category: 'branding',
    key: 'company_name',
    type: 'string',
    maxLength: 120,
    label: 'Nombre de la empresa',
    description: 'Aparece en la cabecera y el pie de las facturas.',
    group: 'Marca',
    editable: true,
  },
  {
    category: 'branding',
    key: 'company_email',
    type: 'string',
    maxLength: 160,
    label: 'Email de contacto',
    description: 'Email de la empresa mostrado en las facturas.',
    group: 'Marca',
    editable: true,
  },
  {
    category: 'branding',
    key: 'company_nif',
    type: 'string',
    maxLength: 32,
    label: 'NIF/CIF',
    description: 'Identificación fiscal de la empresa (facturas).',
    group: 'Marca',
    editable: true,
  },
  {
    category: 'branding',
    key: 'company_address',
    type: 'string',
    maxLength: 200,
    label: 'Dirección',
    description: 'Dirección fiscal de la empresa (facturas).',
    group: 'Marca',
    editable: true,
  },
  {
    category: 'branding',
    key: 'company_city',
    type: 'string',
    maxLength: 80,
    label: 'Ciudad',
    description: 'Ciudad de la empresa (facturas).',
    group: 'Marca',
    editable: true,
  },
  {
    category: 'branding',
    key: 'company_postal_code',
    type: 'string',
    maxLength: 16,
    label: 'Código postal',
    description: 'Código postal de la empresa (facturas).',
    group: 'Marca',
    editable: true,
  },
  {
    category: 'branding',
    key: 'company_country',
    type: 'string',
    maxLength: 80,
    label: 'País',
    description: 'País de la empresa (facturas).',
    group: 'Marca',
    editable: true,
  },
  {
    category: 'branding',
    key: 'primary_color',
    type: 'color',
    label: 'Color primario',
    description: 'Color hexadecimal de la cabecera de las facturas (#RRGGBB).',
    group: 'Marca',
    editable: true,
  },
  {
    // Gestionado por `POST /admin/settings/branding/logo` (subida a MinIO),
    // no por el PATCH de texto libre. Se expone en la lista para que la UI
    // pinte el uploader + preview.
    category: 'branding',
    key: 'logo_key',
    type: 'string',
    label: 'Logo de la empresa',
    description:
      'Se sube como archivo de imagen; aparece en la cabecera de las facturas.',
    group: 'Marca',
    editable: false,
    managed: true,
  },

  // ── Facturación ──
  {
    category: 'billing',
    key: 'invoice_prefix',
    type: 'string',
    maxLength: 12,
    label: 'Prefijo de facturas',
    description:
      'Prefijo del número de factura. Ej.: "AEL" → AEL-2026-0001. Cambiarlo NO renumera las facturas existentes.',
    group: 'Facturación',
    editable: true,
  },
  {
    category: 'billing',
    key: 'payment_due_days',
    type: 'number',
    min: 0,
    max: 365,
    integer: true,
    label: 'Días hasta vencimiento',
    description:
      'Días desde la emisión hasta la fecha de vencimiento de una factura nueva.',
    group: 'Facturación',
    editable: true,
  },
  {
    category: 'billing',
    key: 'default_tax_rate',
    type: 'number',
    min: 0,
    max: 100,
    label: 'IVA por defecto (%)',
    description:
      'Tipo impositivo por defecto aplicado al calcular las facturas (si el ítem no fija uno propio).',
    group: 'Facturación',
    editable: true,
  },
  {
    category: 'billing',
    key: 'invoice_generation_days',
    type: 'number',
    min: 0,
    max: 60,
    integer: true,
    label: 'Antelación de generación de factura (días)',
    description:
      'Días de antelación con que se genera la factura de renovación antes del vencimiento del servicio.',
    group: 'Facturación',
    editable: true,
  },
  {
    category: 'billing',
    key: 'max_payment_retries',
    type: 'number',
    min: 0,
    max: 10,
    integer: true,
    label: 'Reintentos máximos de cobro',
    description:
      'Cuántas veces se reintenta cobrar una factura vencida antes de suspender el servicio.',
    group: 'Facturación',
    editable: true,
  },
  {
    category: 'billing',
    key: 'retry_interval_days',
    type: 'number',
    min: 1,
    max: 30,
    integer: true,
    label: 'Días entre reintentos de cobro',
    description:
      'Días que se esperan entre dos reintentos de cobro de una factura vencida.',
    group: 'Facturación',
    editable: true,
  },
  {
    category: 'billing',
    key: 'suspension_days',
    type: 'number',
    min: 1,
    max: 90,
    integer: true,
    label: 'Margen antes de suspender (días)',
    description:
      'Días tras el vencimiento (con los reintentos agotados) antes de suspender el servicio por impago.',
    group: 'Facturación',
    editable: true,
  },
  {
    category: 'billing',
    key: 'cancellation_days',
    type: 'number',
    min: 1,
    max: 365,
    integer: true,
    label: 'Días hasta cancelación tras suspensión',
    description:
      'Días que un servicio permanece suspendido por impago antes de cancelarse automáticamente.',
    group: 'Facturación',
    editable: true,
  },
  {
    // audit 2026-06-25 GL-2 / H2.3: días de antelación del aviso previo a la
    // cancelación irreversible. El cron `notifyUpcomingCancellations` avisa al
    // cliente cuando un servicio suspendido por impago lleva
    // `cancellation_days - cancellation_notice_days` días suspendido (la
    // cancelación destruye el recurso en el proveedor — `plugin.deprovision()`).
    // Debe ser < `cancellation_days`; si no, el aviso degrada a "avisar al
    // suspender" (el cron clampa el lead a `cancellation_days`).
    category: 'billing',
    key: 'cancellation_notice_days',
    type: 'number',
    min: 1,
    max: 90,
    integer: true,
    label: 'Antelación del aviso de cancelación (días)',
    description:
      'Días de antelación con que se avisa al cliente antes de cancelar (y destruir) automáticamente un servicio suspendido por impago. Debe ser menor que los días hasta cancelación.',
    group: 'Facturación',
    editable: true,
  },

  // ── Soporte ──
  {
    category: 'support',
    key: 'auto_close_resolved_days',
    type: 'number',
    min: 1,
    max: 90,
    integer: true,
    label: 'Días de auto-cierre de tickets resueltos',
    description:
      'Días que un ticket en `resolved` espera respuesta del cliente antes del cierre silencioso por cron.',
    group: 'Soporte',
    editable: true,
  },
  {
    category: 'support',
    key: 'maintenance_critical_threshold_days',
    type: 'number',
    min: 1,
    max: 365,
    integer: true,
    label: 'Umbral de mantenimiento crítico (días)',
    description:
      'Días sin registro de mantenimiento tras los que se alerta al superadmin.',
    group: 'Soporte',
    editable: true,
  },
  {
    category: 'support',
    key: 'ai_filter_enabled',
    type: 'boolean',
    label: 'Filtro de IA en soporte',
    description:
      'Activa el filtrado por IA de los mensajes entrantes de soporte.',
    group: 'Soporte',
    editable: true,
  },

  // ── Notificaciones ──
  {
    category: 'notifications',
    key: 'email_enabled_globally',
    type: 'boolean',
    label: 'Envío de emails (kill switch global)',
    description:
      'Interruptor global de envío de emails. Si está desactivado, NINGÚN email sale del sistema.',
    group: 'Notificaciones',
    editable: true,
  },
  {
    category: 'notifications',
    key: 'retention_days',
    type: 'number',
    min: 7,
    max: 3650,
    integer: true,
    label: 'Retención de notificaciones (días)',
    description:
      'Días que se conservan las notificaciones leídas antes de borrarse.',
    group: 'Notificaciones',
    editable: true,
  },
  {
    category: 'notifications',
    key: 'unread_max_in_dropdown',
    type: 'number',
    min: 5,
    max: 200,
    integer: true,
    label: 'Máximo de no-leídas en la campana',
    description: 'Tamaño máximo del dropdown de notificaciones del Topbar.',
    group: 'Notificaciones',
    editable: true,
  },

  // ── Provisioning / DNS ──
  {
    category: 'provisioning',
    key: 'default_nameservers',
    type: 'string[]',
    label: 'Nameservers de Aelium',
    description:
      'Pareja de nameservers que Aelium ofrece a sus dominios (fuente de verdad cluster-wide, ADR-082 §4).',
    group: 'Provisioning / DNS',
    editable: true,
  },
  {
    category: 'provisioning',
    key: 'registrar_parking_nameservers',
    type: 'string[]',
    label: 'Nameservers de parking del registrar',
    description:
      'NS de parking para dominios-solo sin hosting (ADR-082 Amendment F.3). Provisional hasta el smoke real.',
    group: 'Provisioning / DNS',
    editable: true,
  },
];

const CATALOG_INDEX: ReadonlyMap<string, SettingCatalogEntry> = new Map(
  SETTINGS_CATALOG.map((e) => [`${e.category}.${e.key}`, e]),
);

/** Busca la entrada de catálogo de un `(category, key)`. */
export function findSettingEntry(
  category: string,
  key: string,
): SettingCatalogEntry | undefined {
  return CATALOG_INDEX.get(`${category}.${key}`);
}

/**
 * Error de validación de un valor de setting contra su entrada de catálogo.
 * El service lo mapea a `BadRequestException` con el mensaje humano.
 */
export class SettingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingValidationError';
  }
}

/**
 * Coerciona y valida un valor crudo entrante contra el tipo del catálogo.
 * Devuelve el valor canónico listo para persistir, o lanza
 * `SettingValidationError` con un mensaje claro.
 */
export function coerceAndValidateSetting(
  entry: SettingCatalogEntry,
  raw: unknown,
): SettingValue {
  const label = entry.label || `${entry.category}.${entry.key}`;

  switch (entry.type) {
    case 'string': {
      if (typeof raw !== 'string') {
        throw new SettingValidationError(`"${label}" debe ser texto.`);
      }
      const v = raw.trim();
      if (v.length === 0) {
        throw new SettingValidationError(`"${label}" no puede estar vacío.`);
      }
      const max = entry.maxLength ?? 200;
      if (v.length > max) {
        throw new SettingValidationError(
          `"${label}" no puede exceder ${max} caracteres.`,
        );
      }
      return v;
    }

    case 'color': {
      if (typeof raw !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw.trim())) {
        throw new SettingValidationError(
          `"${label}" debe ser un color hexadecimal (#RRGGBB).`,
        );
      }
      return raw.trim().toLowerCase();
    }

    case 'enum': {
      if (typeof raw !== 'string' || !entry.options?.includes(raw)) {
        throw new SettingValidationError(
          `"${label}" debe ser uno de: ${entry.options?.join(', ') ?? ''}.`,
        );
      }
      return raw;
    }

    case 'number': {
      const n =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string' && raw.trim() !== ''
            ? Number(raw)
            : NaN;
      if (!Number.isFinite(n)) {
        throw new SettingValidationError(`"${label}" debe ser un número.`);
      }
      if (entry.integer && !Number.isInteger(n)) {
        throw new SettingValidationError(
          `"${label}" debe ser un número entero.`,
        );
      }
      if (entry.min !== undefined && n < entry.min) {
        throw new SettingValidationError(`"${label}" debe ser ≥ ${entry.min}.`);
      }
      if (entry.max !== undefined && n > entry.max) {
        throw new SettingValidationError(`"${label}" debe ser ≤ ${entry.max}.`);
      }
      return n;
    }

    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      throw new SettingValidationError(
        `"${label}" debe ser verdadero o falso.`,
      );
    }

    case 'string[]': {
      if (!Array.isArray(raw)) {
        throw new SettingValidationError(`"${label}" debe ser una lista.`);
      }
      const arr = raw.map((item) => {
        if (typeof item !== 'string') {
          throw new SettingValidationError(
            `"${label}" debe ser una lista de textos.`,
          );
        }
        return item.trim();
      });
      const clean = arr.filter((item) => item.length > 0);
      if (clean.length === 0) {
        throw new SettingValidationError(`"${label}" no puede estar vacía.`);
      }
      return clean;
    }
  }
}

import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Seed canónico de settings (Sprint 9.6 Fase F.0).
 *
 * Cada setting tiene un consumidor real en código y una descripción
 * humana. Idempotente: `upsert` por (category, key). Reseed no toca
 * settings ya modificados desde la UI (el `update: {}` los preserva).
 *
 * Cada vez que se introduce un setting nuevo debe registrarse aquí
 * y en `docs/50-operations/settings-reference.md`.
 *
 * Sprint 15C Fase 15C.D (ADR-082 §4) — `value` admite cualquier
 * `Prisma.InputJsonValue` (string, number, boolean, array, objeto). Los
 * settings históricos siguen pasando strings; los nuevos con shape
 * estructurado (ej. `provisioning.default_nameservers` array) se leen
 * vía `SettingsService.getJson<T>()`.
 */
interface SeedSetting {
  category: string;
  key: string;
  value: Prisma.InputJsonValue;
  description: string;
}

const SETTINGS: ReadonlyArray<SeedSetting> = [
  // ── general ──
  {
    category: 'general',
    key: 'default_currency',
    value: 'EUR',
    description: 'Moneda por defecto',
  },
  // Nota Sprint 12: el IVA por defecto vive en `billing.default_tax_rate` (lo
  // consume `billing-calculator`); el `general.default_tax_rate` previo era un
  // huérfano sin consumidor → retirado.

  // ── branding (Sprint 12 — ADR-044 Amendment A1) ──
  // Identidad de marca usada en las facturas (y, en follow-up, emails).
  // Canónico para los datos de empresa: sustituye a los `general.company_*`
  // (huérfanos, sin consumidor) y al `category:'company'` que `invoice-pdf`
  // leía sin éxito (convención `{value}` muerta, corregida en 12.B). `logo_key`
  // es la S3 key del logo en MinIO, gestionada por
  // `POST /admin/settings/branding/logo` (no editable como texto libre).
  {
    category: 'branding',
    key: 'company_name',
    value: 'Aelium',
    description: 'Nombre de la empresa (cabecera/pie de facturas)',
  },
  {
    category: 'branding',
    key: 'company_email',
    value: 'hola@aelium.net',
    description: 'Email de contacto de la empresa (facturas)',
  },
  {
    category: 'branding',
    key: 'company_nif',
    value: 'B12345678',
    description: 'NIF/CIF de la empresa (facturas)',
  },
  {
    category: 'branding',
    key: 'company_address',
    value: 'Calle Ejemplo 1',
    description: 'Dirección fiscal de la empresa (facturas)',
  },
  {
    category: 'branding',
    key: 'company_city',
    value: 'Madrid',
    description: 'Ciudad de la empresa (facturas)',
  },
  {
    category: 'branding',
    key: 'company_postal_code',
    value: '28001',
    description: 'Código postal de la empresa (facturas)',
  },
  {
    category: 'branding',
    key: 'company_country',
    value: 'España',
    description: 'País de la empresa (facturas)',
  },
  {
    category: 'branding',
    key: 'primary_color',
    value: '#1a1a1a',
    description: 'Color primario de marca (cabecera de facturas)',
  },
  {
    category: 'branding',
    key: 'logo_key',
    value: '',
    description:
      'S3 key del logo en MinIO. Gestionado por POST /admin/settings/branding/logo (no editable como texto).',
  },

  // ── billing ── (Sprint 12: numeración + IVA + ciclo de vida de impago configurable)
  // TODOS consumidos en código (antes hardcodeados a su default por el bug
  // `{value}` de `getSettingValue`, corregido en Sprint 12). Editables desde
  // `/admin/settings` (grupo Facturación).
  {
    category: 'billing',
    key: 'invoice_prefix',
    value: 'AEL',
    description: 'Prefijo del número de factura (AEL → AEL-2026-0001).',
  },
  {
    category: 'billing',
    key: 'payment_due_days',
    value: '7',
    description:
      'Días desde la emisión hasta el vencimiento de una factura nueva.',
  },
  {
    category: 'billing',
    key: 'default_tax_rate',
    value: '21',
    description:
      'IVA por defecto (%) aplicado al calcular las facturas (`billing-calculator`).',
  },
  {
    category: 'billing',
    key: 'invoice_generation_days',
    value: '7',
    description:
      'Días de antelación con que se genera la factura de renovación de un servicio.',
  },
  {
    category: 'billing',
    key: 'max_payment_retries',
    value: '3',
    description:
      'Reintentos máximos de cobro de una factura vencida antes de suspender.',
  },
  {
    category: 'billing',
    key: 'retry_interval_days',
    value: '3',
    description: 'Días entre reintentos de cobro de una factura vencida.',
  },
  {
    category: 'billing',
    key: 'suspension_days',
    value: '7',
    description:
      'Días de margen tras el vencimiento (con reintentos agotados) antes de suspender el servicio por impago.',
  },
  {
    category: 'billing',
    key: 'cancellation_days',
    value: '30',
    description:
      'Días que un servicio permanece suspendido por impago antes de la cancelación automática.',
  },
  {
    // audit 2026-06-25 GL-2 / H2.3 — antelación del aviso previo a la
    // cancelación irreversible (cron `notifyUpcomingCancellations`). Default 7
    // (< `cancellation_days` 30). Consumidor: ServiceLifecycleWorker.
    category: 'billing',
    key: 'cancellation_notice_days',
    value: '7',
    description:
      'Días de antelación con que se avisa al cliente antes de la cancelación automática de un servicio suspendido por impago.',
  },

  // ── support ──
  {
    category: 'support',
    key: 'auto_close_resolved_days',
    value: '7',
    description:
      'Sprint 16 Amendment A1 / ADR-079: días que un ticket en `resolved` espera confirmación o respuesta del cliente antes del cierre silencioso por cron `support-resolved-auto-close` (02:30 UTC). Renombrado desde `auto_close_days` legacy en Sprint 13.5 Fase C.',
  },
  {
    category: 'support',
    key: 'ai_filter_enabled',
    value: 'true',
    description: 'Filtro IA activo',
  },

  // ── referrals ──
  {
    category: 'referrals',
    key: 'monthly_credit_amount',
    value: '3',
    description: 'Crédito mensual por referido (€)',
  },
  {
    category: 'referrals',
    key: 'system_active',
    value: 'true',
    description: 'Sistema de referidos activo',
  },

  // ── auth ──
  {
    category: 'auth',
    key: 'max_login_attempts',
    value: '5',
    description: 'Intentos máximos de login antes de bloqueo',
  },
  {
    category: 'auth',
    key: 'block_duration_minutes',
    value: '15',
    description: 'Duración del bloqueo por intentos fallidos (minutos)',
  },
  {
    category: 'auth',
    key: 'password_min_length',
    value: '8',
    description: 'Longitud mínima de contraseña',
  },
  {
    category: 'auth',
    key: 'require_uppercase',
    value: 'true',
    description: 'Requerir al menos una mayúscula',
  },
  {
    category: 'auth',
    key: 'require_lowercase',
    value: 'true',
    description: 'Requerir al menos una minúscula',
  },
  {
    category: 'auth',
    key: 'require_number',
    value: 'true',
    description: 'Requerir al menos un número',
  },
  {
    category: 'auth',
    key: 'access_token_expires_minutes',
    value: '15',
    description: 'Expiración del access token (minutos)',
  },
  {
    category: 'auth',
    key: 'refresh_token_expires_days',
    value: '7',
    description: 'Expiración del refresh token (días)',
  },
  {
    category: 'auth',
    key: 'email_verification_expires_hours',
    value: '24',
    description: 'Expiración del token de verificación email (horas)',
  },
  {
    category: 'auth',
    key: 'password_reset_expires_hours',
    value: '1',
    description: 'Expiración del token de reset contraseña (horas)',
  },
  {
    category: 'auth',
    key: 'two_factor_code_expires_minutes',
    value: '5',
    description: 'Expiración del código 2FA (minutos)',
  },

  // ── storage (Sprint 11.5 + ADR-062) ──
  {
    category: 'storage',
    key: 'signed_url_expiry_minutes',
    value: '60',
    description: 'TTL de URLs firmadas para descargas (minutos)',
  },
  {
    category: 'storage',
    key: 'max_upload_size_mb',
    value: '10',
    description: 'Tamaño máximo de archivo subido (MB)',
  },

  // ── jobs (Sprint 9 Fase A + ADR-063) ──
  {
    category: 'jobs',
    key: 'default_retries',
    value: '5',
    description: 'Reintentos por defecto en BullMQ antes de DLQ',
  },
  {
    category: 'jobs',
    key: 'backoff_initial_ms',
    value: '30000',
    description:
      'Backoff exponencial inicial en ms (30s → 60s → 120s → 240s → 480s)',
  },
  {
    category: 'jobs',
    key: 'dlq_alert_to_superadmin',
    value: 'true',
    description:
      'Notificación al superadmin cuando un job entra en DLQ (R7+R13)',
  },

  // ── audit (Sprint 9 Fase E + ADR-017) ──
  {
    category: 'audit',
    key: 'access_retention_days',
    value: '730',
    description:
      'Días de retención de audit_access_log (mínimo legal AEPD: 2 años)',
  },
  {
    // audit 2026-06-25 GL-5 / H3a — retención de audit_change_log (el cron
    // `AuditRetentionCron` ahora purga ambas tablas; ADR-010 §Retención: 2 años
    // → borrado). Default 730 (2 años AEPD), espejo de access_retention_days.
    category: 'audit',
    key: 'change_retention_days',
    value: '730',
    description:
      'Días de retención de audit_change_log (mínimo legal AEPD: 2 años)',
  },

  // ── legal (audit 2026-06-25 GL-5 / H3b.1 — portal de transparencia RGPD) ──
  // Lista de subprocesadores (terceros que reciben datos personales del
  // cliente), mostrada en `/dashboard/transparency` y consumida por
  // `AccountTransparencyService.getSubprocessors` (ADR-010 §Subprocesadores).
  // Solo los terceros que HOY procesan datos en pre-producción; Stripe/Sentry/
  // Anthropic se añadirán al activarse. Editable por el superadmin (UI futura).
  {
    category: 'legal',
    key: 'subprocessors',
    value: [
      {
        name: 'ResellerClub (Endurance/Newfold)',
        purpose: 'Registro y gestión de dominios',
        location: 'India / EE. UU.',
        dpa_url: 'https://www.resellerclub.com/legal/privacy-policy',
      },
      {
        name: 'Enhance CP',
        purpose: 'Aprovisionamiento y gestión del hosting',
        location: 'UE',
        dpa_url: 'https://enhance.com/privacy',
      },
    ],
    description:
      'Subprocesadores RGPD mostrados en el portal de transparencia (ADR-010 §Subprocesadores).',
  },

  // ── notifications (Sprint 9.5 + ADR-042) ──
  {
    category: 'notifications',
    key: 'retention_days',
    value: '90',
    description: 'Días que se conservan notificaciones leídas antes de borrado',
  },
  {
    category: 'notifications',
    key: 'unread_max_in_dropdown',
    value: '50',
    description: 'Tamaño máximo del dropdown de la campana en el Topbar',
  },
  {
    category: 'notifications',
    key: 'email_enabled_globally',
    value: 'true',
    description: 'Kill switch global de envíos email',
  },
  {
    category: 'notifications',
    key: 'maintenance_critical_threshold_days',
    value: '7',
    description:
      'Días antes de fin de mes para alertar tarea crítica de mantenimiento',
  },

  // ── tasks (Sprint 8 Fase C + ADR-072) ──
  // Consumidor: TasksOverdueService — tareas con due_date < now()-N pasan a
  // status=not_completed_in_time + emit task.overdue al agente asignado.
  {
    category: 'tasks',
    key: 'overdue_to_failure_days',
    value: '7',
    description:
      'Días tras due_date para marcar tarea como not_completed_in_time',
  },
  // Consumidores: TasksUnassignedOverdueService (ADR-072 §"SLA por tipo de
  // tarea"). Cada tipo tiene SLA distinto en horas. Si una tarea está en la
  // cola pública (assigned_to=null) y `created_at + sla_hours < now()`, el
  // cron emite task.unassigned_overdue al superadmin. Las claves por tipo
  // siguen el patrón `tasks.unassigned_sla_hours.<type>`; si una entrada
  // falta, fallback a `tasks.unassigned_sla_hours.default`.
  {
    category: 'tasks',
    key: 'unassigned_sla_hours.contact_client',
    value: '24',
    description:
      'SLA en horas para tareas contact_client en cola pública (ADR-072)',
  },
  {
    category: 'tasks',
    key: 'unassigned_sla_hours.maintenance',
    value: '12',
    description: 'SLA en horas para tareas maintenance en cola pública',
  },
  {
    category: 'tasks',
    key: 'unassigned_sla_hours.maintenance_management',
    value: '12',
    description:
      'SLA en horas para tareas maintenance_management en cola pública',
  },
  {
    category: 'tasks',
    key: 'unassigned_sla_hours.custom_work',
    value: '48',
    description: 'SLA en horas para tareas custom_work en cola pública',
  },
  {
    category: 'tasks',
    key: 'unassigned_sla_hours.support_setup',
    value: '4',
    description:
      'SLA en horas para tareas support_setup en cola pública (alta prioridad)',
  },
  {
    category: 'tasks',
    key: 'unassigned_sla_hours.default',
    value: '24',
    description:
      'SLA en horas fallback para tipos sin entrada específica (ADR-072)',
  },

  // ── support (Sprint 8 Fase C) ──
  // Consumidor: MaintenanceCriticalService — servicios activos con
  // service_checklist_items que llevan más de N días sin maintenance_log
  // levantan alerta maintenance.critical al superadmin. Distinto del setting
  // `notifications.maintenance_critical_threshold_days` (lead time intra-mes
  // pre-cierre del mantenimiento mensual — Sprint 9 placeholder, sin
  // consumidor todavía).
  {
    category: 'support',
    key: 'maintenance_critical_threshold_days',
    value: '60',
    description:
      'Días sin maintenance_log para alertar al superadmin (Sprint 8 Fase C)',
  },

  // ── provisioning (Sprint 11 Fase 11.B + ADR-077) ──
  // Consumidor: getServiceInfoWithCache wrapper — TTL del cache Redis DB 2
  // donde se cachea el resultado de `plugin.getServiceInfo(service)` por
  // serviceId. Default 60s (ADR-070 §Mecanismo A).
  {
    category: 'provisioning',
    key: 'service_info_ttl_seconds',
    value: '60',
    description:
      'TTL en segundos del cache service_info (ADR-077 §5 wrapper getServiceInfoWithCache)',
  },

  // ── provisioning · NS-sync C3 (Sprint 15C Fase 15C.D + ADR-082 §4) ──
  // Fuente de verdad de los nameservers que Aelium ofrece. Consumidores:
  //   • EnhanceDnsDefaultsService — propaga a C2 (Enhance default records).
  //   • dns-authority-resolver.ts — comparación NS para flujo F2 vs F3.
  //   • Plugin RC (futuro Sprint 15D) — `domains/register?ns=...`.
  // Editado por superadmin desde `/admin/settings` (Sprint 12). Listener
  // canónico `provisioning.default_nameservers_changed` propagará a C2.
  {
    category: 'provisioning',
    key: 'default_nameservers',
    value: ['ns1.aelium.net', 'ns2.aelium.net'],
    description:
      'NS-sync C3 (ADR-082 §4) — pareja de nameservers que Aelium ofrece a sus dominios. Fuente de verdad cluster-wide.',
  },

  // ── provisioning · NS de parking del registrar (Sprint 15D Fase 15D.F.3 + ADR-082 Amendment "dominio-solo aparca en el registrar") ──
  // Un dominio registrado SIN hosting (flujo F5) aparca en estos NS del
  // registrar (que SÍ resuelven), no en los de Aelium — porque Enhance no
  // puede crear una zona DNS sin un website (verificado: orchd OAS3 +
  // mock) y RC rechaza NS que no resuelven (resellerclub-ote-findings §4.8).
  // Cuando se le añade hosting, el listener switch-domain-ns-on-hosting-activated
  // conmuta a `default_nameservers`. Consumidor: plugin RC en `provision(register)`.
  // ⚠️ VALOR PROVISIONAL — confirmar contra la cuenta RC real en el smoke de
  // Fase G (los NS del servicio DNS gratuito de ResellerClub/LogicBoxes).
  {
    category: 'provisioning',
    key: 'registrar_parking_nameservers',
    value: ['dns1.resellerclub.com', 'dns2.resellerclub.com'],
    description:
      'NS de parking del registrar para dominios-solo sin hosting (ADR-082 Amendment F.3). PROVISIONAL: confirmar en smoke Fase G.',
  },

  // ── provisioning · enhance_cp reconcile (Sprint 15C Fase 15C.H + ADR-083 §6 decisión 24) ──
  // Threshold de divergencias detectadas por el cron `reconcile-enhance-services`
  // por día antes de alertar al superadmin. Consumidor: cron L3 (Fase 15C.H).
  {
    category: 'provisioning',
    key: 'enhance_cp.reconciliation_alert_threshold',
    value: '5',
    description:
      'ADR-083 §6 decisión 24 — divergencias/día detectadas por reconcile-enhance-services antes de alertar al superadmin.',
  },
];

export async function seedSettings(prisma: PrismaClient): Promise<void> {
  for (const s of SETTINGS) {
    await prisma.setting.upsert({
      where: { category_key: { category: s.category, key: s.key } },
      update: {},
      create: {
        category: s.category,
        key: s.key,
        value: s.value,
        description: s.description,
      },
    });
  }
  console.log(`  ✓ ${SETTINGS.length} settings upserted`);
}

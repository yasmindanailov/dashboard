import { PrismaClient } from '@prisma/client';

/**
 * Seed canónico de settings (Sprint 9.6 Fase F.0).
 *
 * Cada setting tiene un consumidor real en código y una descripción
 * humana. Idempotente: `upsert` por (category, key). Reseed no toca
 * settings ya modificados desde la UI (el `update: {}` los preserva).
 *
 * Cada vez que se introduce un setting nuevo debe registrarse aquí
 * y en `docs/50-operations/settings-reference.md`.
 */
interface SeedSetting {
  category: string;
  key: string;
  value: string;
  description: string;
}

const SETTINGS: ReadonlyArray<SeedSetting> = [
  // ── general ──
  { category: 'general', key: 'company_name', value: 'Aelium', description: 'Nombre de la empresa' },
  { category: 'general', key: 'company_email', value: 'hola@aelium.net', description: 'Email de contacto' },
  { category: 'general', key: 'default_currency', value: 'EUR', description: 'Moneda por defecto' },
  { category: 'general', key: 'default_tax_rate', value: '21', description: 'IVA por defecto (%)' },

  // ── billing ──
  { category: 'billing', key: 'invoice_prefix', value: 'AEL', description: 'Prefijo de facturas' },
  { category: 'billing', key: 'payment_due_days', value: '7', description: 'Días hasta vencimiento' },

  // ── support ──
  { category: 'support', key: 'auto_close_resolved_days', value: '7', description: 'Sprint 16 Amendment A1 / ADR-079: días que un ticket en `resolved` espera confirmación o respuesta del cliente antes del cierre silencioso por cron `support-resolved-auto-close` (02:30 UTC). Renombrado desde `auto_close_days` legacy en Sprint 13.5 Fase C.' },
  { category: 'support', key: 'ai_filter_enabled', value: 'true', description: 'Filtro IA activo' },

  // ── referrals ──
  { category: 'referrals', key: 'monthly_credit_amount', value: '3', description: 'Crédito mensual por referido (€)' },
  { category: 'referrals', key: 'system_active', value: 'true', description: 'Sistema de referidos activo' },

  // ── auth ──
  { category: 'auth', key: 'max_login_attempts', value: '5', description: 'Intentos máximos de login antes de bloqueo' },
  { category: 'auth', key: 'block_duration_minutes', value: '15', description: 'Duración del bloqueo por intentos fallidos (minutos)' },
  { category: 'auth', key: 'password_min_length', value: '8', description: 'Longitud mínima de contraseña' },
  { category: 'auth', key: 'require_uppercase', value: 'true', description: 'Requerir al menos una mayúscula' },
  { category: 'auth', key: 'require_lowercase', value: 'true', description: 'Requerir al menos una minúscula' },
  { category: 'auth', key: 'require_number', value: 'true', description: 'Requerir al menos un número' },
  { category: 'auth', key: 'access_token_expires_minutes', value: '15', description: 'Expiración del access token (minutos)' },
  { category: 'auth', key: 'refresh_token_expires_days', value: '7', description: 'Expiración del refresh token (días)' },
  { category: 'auth', key: 'email_verification_expires_hours', value: '24', description: 'Expiración del token de verificación email (horas)' },
  { category: 'auth', key: 'password_reset_expires_hours', value: '1', description: 'Expiración del token de reset contraseña (horas)' },
  { category: 'auth', key: 'two_factor_code_expires_minutes', value: '5', description: 'Expiración del código 2FA (minutos)' },

  // ── storage (Sprint 11.5 + ADR-062) ──
  { category: 'storage', key: 'signed_url_expiry_minutes', value: '60', description: 'TTL de URLs firmadas para descargas (minutos)' },
  { category: 'storage', key: 'max_upload_size_mb', value: '10', description: 'Tamaño máximo de archivo subido (MB)' },

  // ── jobs (Sprint 9 Fase A + ADR-063) ──
  { category: 'jobs', key: 'default_retries', value: '5', description: 'Reintentos por defecto en BullMQ antes de DLQ' },
  { category: 'jobs', key: 'backoff_initial_ms', value: '30000', description: 'Backoff exponencial inicial en ms (30s → 60s → 120s → 240s → 480s)' },
  { category: 'jobs', key: 'dlq_alert_to_superadmin', value: 'true', description: 'Notificación al superadmin cuando un job entra en DLQ (R7+R13)' },

  // ── audit (Sprint 9 Fase E + ADR-017) ──
  { category: 'audit', key: 'access_retention_days', value: '730', description: 'Días de retención de audit_access_log (mínimo legal AEPD: 2 años)' },

  // ── notifications (Sprint 9.5 + ADR-042) ──
  { category: 'notifications', key: 'retention_days', value: '90', description: 'Días que se conservan notificaciones leídas antes de borrado' },
  { category: 'notifications', key: 'unread_max_in_dropdown', value: '50', description: 'Tamaño máximo del dropdown de la campana en el Topbar' },
  { category: 'notifications', key: 'email_enabled_globally', value: 'true', description: 'Kill switch global de envíos email' },
  { category: 'notifications', key: 'maintenance_critical_threshold_days', value: '7', description: 'Días antes de fin de mes para alertar tarea crítica de mantenimiento' },

  // ── tasks (Sprint 8 Fase C + ADR-072) ──
  // Consumidor: TasksOverdueService — tareas con due_date < now()-N pasan a
  // status=not_completed_in_time + emit task.overdue al agente asignado.
  { category: 'tasks', key: 'overdue_to_failure_days', value: '7', description: 'Días tras due_date para marcar tarea como not_completed_in_time' },
  // Consumidores: TasksUnassignedOverdueService (ADR-072 §"SLA por tipo de
  // tarea"). Cada tipo tiene SLA distinto en horas. Si una tarea está en la
  // cola pública (assigned_to=null) y `created_at + sla_hours < now()`, el
  // cron emite task.unassigned_overdue al superadmin. Las claves por tipo
  // siguen el patrón `tasks.unassigned_sla_hours.<type>`; si una entrada
  // falta, fallback a `tasks.unassigned_sla_hours.default`.
  { category: 'tasks', key: 'unassigned_sla_hours.contact_client', value: '24', description: 'SLA en horas para tareas contact_client en cola pública (ADR-072)' },
  { category: 'tasks', key: 'unassigned_sla_hours.maintenance', value: '12', description: 'SLA en horas para tareas maintenance en cola pública' },
  { category: 'tasks', key: 'unassigned_sla_hours.maintenance_management', value: '12', description: 'SLA en horas para tareas maintenance_management en cola pública' },
  { category: 'tasks', key: 'unassigned_sla_hours.custom_work', value: '48', description: 'SLA en horas para tareas custom_work en cola pública' },
  { category: 'tasks', key: 'unassigned_sla_hours.support_setup', value: '4', description: 'SLA en horas para tareas support_setup en cola pública (alta prioridad)' },
  { category: 'tasks', key: 'unassigned_sla_hours.default', value: '24', description: 'SLA en horas fallback para tipos sin entrada específica (ADR-072)' },

  // ── support (Sprint 8 Fase C) ──
  // Consumidor: MaintenanceCriticalService — servicios activos con
  // service_checklist_items que llevan más de N días sin maintenance_log
  // levantan alerta maintenance.critical al superadmin. Distinto del setting
  // `notifications.maintenance_critical_threshold_days` (lead time intra-mes
  // pre-cierre del mantenimiento mensual — Sprint 9 placeholder, sin
  // consumidor todavía).
  { category: 'support', key: 'maintenance_critical_threshold_days', value: '60', description: 'Días sin maintenance_log para alertar al superadmin (Sprint 8 Fase C)' },

  // ── provisioning (Sprint 11 Fase 11.B + ADR-077) ──
  // Consumidor: getServiceInfoWithCache wrapper — TTL del cache Redis DB 2
  // donde se cachea el resultado de `plugin.getServiceInfo(service)` por
  // serviceId. Default 60s (ADR-070 §Mecanismo A).
  { category: 'provisioning', key: 'service_info_ttl_seconds', value: '60', description: 'TTL en segundos del cache service_info (ADR-077 §5 wrapper getServiceInfoWithCache)' },
];

export async function seedSettings(prisma: PrismaClient): Promise<void> {
  for (const s of SETTINGS) {
    await prisma.setting.upsert({
      where: { category_key: { category: s.category, key: s.key } },
      update: {},
      create: s,
    });
  }
  console.log(`  ✓ ${SETTINGS.length} settings upserted`);
}

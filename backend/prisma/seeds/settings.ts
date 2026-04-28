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
  { category: 'support', key: 'auto_close_days', value: '7', description: 'Días para cerrar conversación inactiva' },
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

import 'dotenv/config';
import { PrismaClient, RoleSlug } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // ── Roles ──
  const roles = [
    { slug: RoleSlug.superadmin, name: 'Superadmin', description: 'Acceso total al sistema', is_system: true },
    { slug: RoleSlug.agent_full, name: 'Agente completo', description: 'Acceso a todos los módulos operativos', is_system: true },
    { slug: RoleSlug.agent_billing, name: 'Agente facturación', description: 'Acceso solo a billing y clientes', is_system: true },
    { slug: RoleSlug.agent_support, name: 'Agente soporte', description: 'Acceso solo a soporte y tareas', is_system: true },
    { slug: RoleSlug.client, name: 'Cliente', description: 'Acceso al portal de cliente', is_system: true },
    { slug: RoleSlug.partner_pending, name: 'Partner pendiente', description: 'Registrado, pendiente de aprobación', is_system: true },
    { slug: RoleSlug.partner, name: 'Partner', description: 'Agencia partner aprobada', is_system: true },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { slug: role.slug },
      update: {},
      create: role,
    });
  }
  console.log(`  ✓ ${roles.length} roles created`);

  // ── Superadmin ──
  const superadminRole = await prisma.role.findUnique({ where: { slug: RoleSlug.superadmin } });
  if (!superadminRole) throw new Error('Superadmin role not found');

  const email = process.env.SUPERADMIN_EMAIL || 'admin@aelium.net';
  const password = process.env.SUPERADMIN_PASSWORD || 'AeliumDev2026!';
  const hash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { password_hash: hash },
    create: {
      email,
      password_hash: hash,
      first_name: 'Admin',
      last_name: 'Aelium',
      status: 'active',
      email_verified_at: new Date(),
      role_id: superadminRole.id,
    },
  });
  console.log(`  ✓ Superadmin created (${email})`);

  // ── Settings ──
  const settings = [
    { category: 'general', key: 'company_name', value: 'Aelium', description: 'Nombre de la empresa' },
    { category: 'general', key: 'company_email', value: 'hola@aelium.net', description: 'Email de contacto' },
    { category: 'general', key: 'default_currency', value: 'EUR', description: 'Moneda por defecto' },
    { category: 'general', key: 'default_tax_rate', value: '21', description: 'IVA por defecto (%)' },
    { category: 'billing', key: 'invoice_prefix', value: 'AEL', description: 'Prefijo de facturas' },
    { category: 'billing', key: 'payment_due_days', value: '7', description: 'Días hasta vencimiento' },
    { category: 'support', key: 'auto_close_days', value: '7', description: 'Días para cerrar conversación inactiva' },
    { category: 'support', key: 'ai_filter_enabled', value: 'true', description: 'Filtro IA activo' },
    { category: 'referrals', key: 'monthly_credit_amount', value: '3', description: 'Crédito mensual por referido (€)' },
    { category: 'referrals', key: 'system_active', value: 'true', description: 'Sistema de referidos activo' },
    // Auth settings (configurable desde el dashboard)
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
    // Storage settings (Sprint 11.5 + ADR-062)
    { category: 'storage', key: 'signed_url_expiry_minutes', value: '60', description: 'TTL de URLs firmadas para descargas (minutos)' },
    { category: 'storage', key: 'max_upload_size_mb', value: '10', description: 'Tamaño máximo de archivo subido (MB) — uploads externos (chat/tickets)' },
    // Jobs settings (Sprint 9 Fase A + ADR-063)
    { category: 'jobs', key: 'default_retries', value: '5', description: 'Reintentos por defecto en BullMQ antes de DLQ (ADR-055)' },
    { category: 'jobs', key: 'backoff_initial_ms', value: '30000', description: 'Backoff exponencial inicial en ms (30s → 60s → 120s → 240s → 480s)' },
    { category: 'jobs', key: 'dlq_alert_to_superadmin', value: 'true', description: 'Emitir notificación al superadmin cuando un job entra en DLQ (R7+R13)' },
  ];

  for (const s of settings) {
    await prisma.setting.upsert({
      where: { category_key: { category: s.category, key: s.key } },
      update: {},
      create: { ...s, value: s.value },
    });
  }
  console.log(`  ✓ ${settings.length} settings created`);

  console.log('✅ Seed completed');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

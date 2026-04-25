/**
 * Helpers de base de datos para tests E2E.
 *
 * Usamos `pg` directo (no Prisma) porque:
 * - Los tests viven en /tests/e2e/, fuera de backend/, y no tienen acceso
 *   al @prisma/client generado en backend/node_modules.
 * - SQL directo es más rápido para cleanup que pasar por el ORM.
 * - Independiza los tests de regenerar el client cada vez que cambia el schema.
 *
 * Las tablas se truncan respetando FKs vía CASCADE. Roles, settings y el
 * superadmin permanecen (datos del seed que asumimos presentes).
 */

import { Pool } from 'pg';
import { TEST_CONFIG } from './test-config';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL no definido. Los tests E2E requieren conexión directa a la DB.',
      );
    }
    pool = new Pool({ connectionString, max: 2 });
  }
  return pool;
}

/**
 * Cierra la conexión del pool. Llamar en `afterAll` del último describe
 * o se quedará abierta hasta el final del proceso (normalmente OK).
 */
export async function disconnectDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Tablas que se truncan entre tests. Orden no importa con TRUNCATE CASCADE.
 * NO incluye: roles, settings (datos del seed). users se trata aparte para
 * preservar el superadmin.
 */
const TABLES_TO_TRUNCATE = [
  'messages',
  'conversations',
  'invoice_items',
  'invoices',
  'services',
  'billing_profiles',
  'client_notes',
  'client_profiles',
  'email_verifications',
  'password_resets',
  'sessions',
  'notifications',
  'tasks',
  'audit_access_log',
  'audit_change_log',
  'error_log',
  'event_outbox',
  // Productos: los preservamos si están seedeados; solo se borran si futuros
  // tests los crean. Por ahora no se tocan.
];

/**
 * Limpia datos de tests previos manteniendo seed (roles, settings, superadmin).
 * Usa TRUNCATE CASCADE para velocidad y respeto de FKs.
 *
 * Llamar en `beforeAll` (preferido) o `beforeEach` según necesidad.
 */
export async function resetTestData(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    // TRUNCATE de las tablas en una sola operación con CASCADE.
    const tableList = TABLES_TO_TRUNCATE.map((t) => `"${t}"`).join(', ');
    await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);

    // Borrar todos los users excepto el superadmin (preservado por el seed).
    await client.query(`DELETE FROM users WHERE email <> $1`, [TEST_CONFIG.superadmin.email]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Borra un usuario por email (idempotente). Útil para test setup específico.
 */
export async function deleteUserByEmail(email: string): Promise<void> {
  await getPool().query(`DELETE FROM users WHERE email = $1`, [email]);
}

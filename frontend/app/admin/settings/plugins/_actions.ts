'use server';

import { revalidatePath } from 'next/cache';

import type {
  AdminPluginTestConnectionResponse,
  AdminPluginUpdateBody,
  AdminPluginUpdateResponse,
} from '../../../lib/api';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — /admin/settings/plugins.
   Sprint 15A Fase H.2 (Modelo A cookies httpOnly — ADR-078).

   Las 3 actions canónicas: update (edita config/secrets/enabled),
   toggle (atajo enabled-only, idempotente), testConnection (lectura
   sin persistir). Todas via `serverFetch` que adjunta cookies httpOnly
   Aelium Auth automáticamente.

   Convención de result: shape `{ ok: true, ... } | { ok: false, error }`
   coherente con `updateTemplateAction` (Sprint 13 §13.AUTH Fase E).
   ═══════════════════════════════════════ */

export type PluginUpdateResult =
  | { ok: true; data: AdminPluginUpdateResponse }
  | { ok: false; error: string; code?: string };

/**
 * Edita config / secrets / enabled de un plugin.
 *
 * El backend valida config + secrets contra `manifest.configSchema` /
 * `manifest.secretsSchema` con Ajv (Sprint 15A Fase G). En errores 400
 * con code `INVALID_PLUGIN_CONFIG` o `INVALID_PLUGIN_SECRETS`, el
 * `error` contiene el primer detail.message para que el form lo muestre
 * inline; el `code` permite que el cliente lo distinga si necesita.
 */
export async function updatePluginAction(
  slug: string,
  body: AdminPluginUpdateBody,
): Promise<PluginUpdateResult> {
  try {
    const data = await serverFetch<AdminPluginUpdateResponse>(
      `/admin/plugins/${slug}`,
      { method: 'PATCH', body: body as Record<string, unknown> },
    );
    revalidatePath('/admin/settings/plugins');
    revalidatePath(`/admin/settings/plugins/${slug}`);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ServerFetchError) {
      const code = extractAjvCode(err);
      // Sprint 15C.II Fase F.8 hotfix UX: cuando el backend rechaza el config
      // o los secrets contra el manifest, el `GlobalExceptionFilter` propaga
      // `code` + `details[{path, message}]` al top-level del response. Por
      // defecto `err.message` solo trae "Bad Request" — el smoke real de F.8
      // (umbral de cuota fuera del rango 50-95) destapó que el toast quedaba
      // genérico. Aquí formateamos los details (path + mensaje Ajv traducido
      // a ES) para devolver un error legible que el form muestre inline.
      const detailsMsg = formatAjvDetailsMessage(err);
      return {
        ok: false,
        error: detailsMsg ?? err.message,
        code,
      };
    }
    return { ok: false, error: 'No se pudo actualizar el plugin.' };
  }
}

/**
 * Atajo idempotente para habilitar/deshabilitar sin tocar config/secrets.
 * Equivalente a `updatePluginAction(slug, { enabled })` pero la firma
 * concisa simplifica los toggles inline en cards/lista.
 */
export async function togglePluginAction(
  slug: string,
  enabled: boolean,
): Promise<PluginUpdateResult> {
  return updatePluginAction(slug, { enabled });
}

export type PluginTestConnectionResult =
  | { ok: true; data: AdminPluginTestConnectionResponse }
  | { ok: false; error: string };

/**
 * Invoca el test-connection del plugin (`POST /admin/plugins/:slug/test-connection`).
 * NO revalida path — es lectura pura; el resultado se muestra inline en el
 * componente del form sin cambiar el estado persistido.
 */
export async function testConnectionAction(
  slug: string,
): Promise<PluginTestConnectionResult> {
  try {
    const data = await serverFetch<AdminPluginTestConnectionResponse>(
      `/admin/plugins/${slug}/test-connection`,
      { method: 'POST', body: {} },
    );
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo probar la conexión.',
    };
  }
}

/* ═══════════════════════════════════════
   Sprint 15C.II Fase B (ADR-083 Amendment A4.2 + gap G1) — reconcile-all.

   Materializa la decisión doctrinal A2 frozen 2026-05-10. Doble propósito:
     1. UX A2: botón "↻ Reconciliar todos los servicios contra <Plugin>
        ahora" en `/admin/settings/plugins/[slug]` (sin esperar el cron L3).
     2. Gap G1: desbloquea smoke testing manual sin esperar la próxima
        ventana del cron L3 (típicamente 6h en plugin Enhance).

   El backend valida que el plugin declare capabilities.supports_reconciliation
   = true Y haya registrado un executor en `ReconcileRegistryService` (típicamente
   vía onModuleInit() del cron reconciliation correspondiente).
   ═══════════════════════════════════════ */

export interface ReconcileAllResponseBody {
  readonly slug: string;
  readonly triggered_at: string;
  readonly services_processed: number;
  readonly drifts_detected: number;
  readonly duration_ms: number;
  readonly details: Readonly<Record<string, unknown>> | null;
}

export type ReconcileAllResult =
  | { ok: true; data: ReconcileAllResponseBody }
  | { ok: false; error: string };

export async function reconcileAllPluginAction(
  slug: string,
): Promise<ReconcileAllResult> {
  try {
    const data = await serverFetch<ReconcileAllResponseBody>(
      `/admin/plugins/${slug}/reconcile-all`,
      { method: 'POST', body: {} },
    );
    revalidatePath(`/admin/settings/plugins/${slug}`);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo reconciliar el plugin.',
    };
  }
}

/**
 * Extrae el code semántico (`INVALID_PLUGIN_CONFIG` / `INVALID_PLUGIN_SECRETS`)
 * del error si el backend lo expuso en el body 400. Otros errores devuelven
 * `undefined` y el caller usa solo `error.message`.
 */
function extractAjvCode(err: ServerFetchError): string | undefined {
  const body = err.body as { code?: unknown } | undefined;
  if (body && typeof body === 'object' && typeof body.code === 'string') {
    return body.code;
  }
  return undefined;
}

/**
 * Sprint 15C.II Fase F.8 hotfix UX. Extrae los `details[]` que el
 * `validateConfigOrThrow` / `validateSecretsOrThrow` del backend
 * (`admin-plugins.service.ts`) inserta en el response 400 vía Ajv
 * (`{path, message}` por error). El `GlobalExceptionFilter` ya los copia
 * al top-level del response — aquí los formateamos a un string legible en
 * ES con el nombre del campo + el mensaje Ajv traducido. Si el body no
 * tiene `details` parseable, devuelve `null` y el caller cae al
 * `err.message` original.
 *
 * Devuelve un string como:
 *   "Umbral de alerta de cuota de disco (%): debe ser mayor o igual que 50"
 *
 * Los mensajes Ajv canónicos que vemos en el manifest hoy:
 *   - `must be >= N` → `debe ser mayor o igual que N`
 *   - `must be <= N` → `debe ser menor o igual que N`
 *   - `must be integer` → `debe ser un número entero`
 *   - `must be string` / `must be number` / `must be boolean`
 *   - `must NOT have additional properties`
 *   - `must have required property 'X'`
 *
 * Otros mensajes Ajv pasan tal cual (legibles en inglés pero al menos
 * con el campo identificado, no "Bad Request" genérico).
 */
function formatAjvDetailsMessage(err: ServerFetchError): string | null {
  const body = err.body as
    | {
        details?: Array<{ path?: unknown; message?: unknown }>;
      }
    | undefined;
  const details = body?.details;
  if (!Array.isArray(details) || details.length === 0) return null;

  const parts: string[] = [];
  for (const d of details) {
    const path = typeof d.path === 'string' ? d.path : '';
    const msgEn = typeof d.message === 'string' ? d.message : 'inválido';
    const fieldLabel = humanizeAjvPath(path);
    const msgEs = translateAjvMessage(msgEn);
    parts.push(fieldLabel ? `${fieldLabel}: ${msgEs}` : msgEs);
  }
  return parts.join(' · ');
}

/**
 * Traduce el path Ajv (`/quota_alert_threshold_pct`, `/baseUrl`…) a un
 * label humano. Hoy mapeo manual de los 5 campos canónicos del manifest
 * Enhance — heredable cuando se promocione algún path nuevo. Path
 * desconocido cae al snake_case original (legible en su forma cruda).
 */
function humanizeAjvPath(path: string): string {
  if (!path) return '';
  const field = path.replace(/^\//, '').split('/')[0];
  switch (field) {
    case 'baseUrl':
      return 'URL base de la API';
    case 'masterOrgId':
      return 'UUID del Master Org';
    case 'reconciliationIntervalHours':
      return 'Intervalo de reconciliación (horas)';
    case 'quota_alert_threshold_pct':
      return 'Umbral de alerta de cuota de disco (%)';
    case 'apiToken':
      return 'Bearer token API';
    default:
      return field;
  }
}

/**
 * Traduce mensajes Ajv canónicos a ES. Conservador: mensajes desconocidos
 * pasan tal cual (mejor inglés legible que omitir info).
 */
function translateAjvMessage(msgEn: string): string {
  const gte = msgEn.match(/^must be >=?\s*(-?\d+(?:\.\d+)?)$/);
  if (gte) return `debe ser mayor o igual que ${gte[1]}`;
  const lte = msgEn.match(/^must be <=?\s*(-?\d+(?:\.\d+)?)$/);
  if (lte) return `debe ser menor o igual que ${lte[1]}`;
  const gt = msgEn.match(/^must be >\s*(-?\d+(?:\.\d+)?)$/);
  if (gt) return `debe ser mayor que ${gt[1]}`;
  const lt = msgEn.match(/^must be <\s*(-?\d+(?:\.\d+)?)$/);
  if (lt) return `debe ser menor que ${lt[1]}`;
  if (msgEn === 'must be integer') return 'debe ser un número entero';
  if (msgEn === 'must be number') return 'debe ser un número';
  if (msgEn === 'must be string') return 'debe ser un texto';
  if (msgEn === 'must be boolean') return 'debe ser verdadero o falso';
  if (msgEn === 'must be array') return 'debe ser una lista';
  if (msgEn === 'must be object') return 'debe ser un objeto';
  if (msgEn === 'must NOT have additional properties')
    return 'contiene un campo no permitido';
  const req = msgEn.match(/^must have required property '(.+)'$/);
  if (req) return `falta el campo obligatorio "${req[1]}"`;
  const fmt = msgEn.match(/^must match format "(.+)"$/);
  if (fmt) return `no tiene el formato esperado (${fmt[1]})`;
  const len = msgEn.match(/^must NOT have fewer than (\d+) characters$/);
  if (len) return `debe tener al menos ${len[1]} caracteres`;
  return msgEn;
}

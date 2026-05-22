/**
 * Sprint 15D.B0 — Research empirico de la API ResellerClub contra OT&E (sandbox).
 * Doc del metodo: docs/_research/sprint-15d/README.md  ·  ADR-081 §11.
 *
 * Ejecutar (desde backend/):  npx ts-node --transpile-only scripts/research-resellerclub-ote.ts
 * Requiere en backend/.env:  RESELLERCLUB_OTE_USERID, RESELLERCLUB_OTE_APIKEY
 * + la IP publica whitelisteada en el panel demo de ResellerClub.
 *
 * SEGURIDAD:
 *  - Apunta SOLO a https://test.httpapi.com/api/ (sandbox). NUNCA a produccion.
 *  - No imprime ni persiste las credenciales (auth-userid / api-key).
 *  - register/renew en OT&E son sandbox (sin coste ni dominios reales; el demo se resetea cada 24h).
 *
 * Objetivo: capturar request (sin auth) + response/errores REALES de los endpoints
 * del scope v1 core, para alimentar el cliente HTTP + el MockResellerClubServer.
 */
import { config as loadEnv } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Credenciales OT&E: viven en el .env de la raiz del repo (dashboard/.env);
// backend/.env como fallback. dotenv no sobreescribe variables ya presentes.
loadEnv({ path: join(__dirname, '..', '..', '.env') });
loadEnv({ path: join(__dirname, '..', '.env') });

const SANDBOX_URL = 'https://test.httpapi.com/api/'; // hardcoded: nunca live
const USERID = process.env.RESELLERCLUB_OTE_USERID;
const APIKEY = process.env.RESELLERCLUB_OTE_APIKEY;

if (!USERID || !APIKEY) {
  console.error(
    '[research] Faltan RESELLERCLUB_OTE_USERID / RESELLERCLUB_OTE_APIKEY en backend/.env',
  );
  process.exit(1);
}

interface Finding {
  step: string;
  command: string;
  method: 'GET' | 'POST';
  requestParams: Record<string, unknown>; // SIN credenciales
  httpStatus: number | null;
  ok: boolean;
  response: unknown;
  note?: string;
}

const findings: Finding[] = [];

function buildQuery(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      for (const item of v) usp.append(k, String(item)); // ns=a&ns=b (RFC: claves duplicadas)
    } else if (v !== undefined && v !== null) {
      usp.append(k, String(v));
    }
  }
  return usp.toString();
}

/** RC devuelve HTTP 200 con { status: 'ERROR', message } en errores de negocio. */
function isRcError(resp: unknown): boolean {
  return (
    !!resp &&
    typeof resp === 'object' &&
    (resp as Record<string, unknown>).status === 'ERROR'
  );
}

function extractId(resp: unknown): string | undefined {
  if (typeof resp === 'number') return String(resp);
  if (typeof resp === 'string' && /^\d+$/.test(resp.trim())) return resp.trim();
  if (resp && typeof resp === 'object') {
    const o = resp as Record<string, unknown>;
    for (const key of ['entityid', 'entity.id', 'eaqid', 'customerid', 'contactid', 'id']) {
      if (o[key] != null && /^\d+$/.test(String(o[key]))) return String(o[key]);
    }
  }
  return undefined;
}

async function callRc(
  step: string,
  command: string,
  params: Record<string, unknown>,
  method: 'GET' | 'POST' = 'GET',
): Promise<Finding> {
  const url = `${SANDBOX_URL}${command}.json`;
  const authed = { ...params, 'auth-userid': USERID, 'api-key': APIKEY };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let httpStatus: number | null = null;
  let response: unknown = null;
  let ok = false;
  try {
    // Cloudflare (delante de httpapi.com) bloquea clientes sin UA de navegador.
    // El cliente real del plugin (15D.C) debera enviar un User-Agent realista.
    const browserHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    const res =
      method === 'GET'
        ? await fetch(`${url}?${buildQuery(authed)}`, { headers: browserHeaders, signal: controller.signal })
        : await fetch(url, {
            method: 'POST',
            headers: { ...browserHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: buildQuery(authed),
            signal: controller.signal,
          });
    httpStatus = res.status;
    const text = await res.text();
    try {
      response = JSON.parse(text);
    } catch {
      response = text.slice(0, 2000); // shape no-JSON, capturar crudo
    }
    ok = res.ok && !isRcError(response);
  } catch (err) {
    response = { fetchError: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
  const finding: Finding = { step, command, method, requestParams: params, httpStatus, ok, response };
  findings.push(finding);
  const preview = JSON.stringify(response, null, 2);
  console.log(`\n[${ok ? 'OK ' : 'ERR'}] ${step} — ${method} ${command}.json (HTTP ${httpStatus})`);
  console.log(preview.length > 1500 ? `${preview.slice(0, 1500)}\n…(truncado)` : preview);
  return finding;
}

function skip(step: string, command: string, note: string): void {
  findings.push({ step, command, method: 'POST', requestParams: {}, httpStatus: null, ok: false, response: null, note });
  console.log(`\n[SKIP] ${step} — ${note}`);
}

async function main(): Promise<void> {
  console.log('=== Research ResellerClub OT&E (sandbox: test.httpapi.com) ===');
  console.log(`auth-userid: ${String(USERID).slice(0, 3)}*** (oculto)`);
  const ts = Date.now();
  const label = `aeliumote${ts}`;
  const demoEmail = `ote.${ts}@aelium.test`;

  // ─── 1. Pre-venta: availability + suggest + pricing ───────────────────────
  await callRc('avail_free', 'domains/available', { 'domain-name': label, tlds: ['com', 'net', 'org', 'es', 'eu'] }, 'GET');
  await callRc('avail_taken', 'domains/available', { 'domain-name': 'google', tlds: ['com'] }, 'GET');
  await callRc('suggest_names', 'domains/suggest-names', { keyword: 'aelium hosting', tlds: ['com'], 'no-of-results': 5 }, 'GET');
  // Pricing: probar ambos endpoints conocidos (coste reseller + precio customer)
  await callRc('reseller_price', 'products/reseller-price', {}, 'GET');
  await callRc('customer_price', 'products/customer-price', {}, 'GET');

  // ─── 2. Customer lazy: details (existe?) -> signup ────────────────────────
  await callRc('customer_details_miss', 'customers/details', { username: demoEmail }, 'GET');
  const signup = await callRc('customer_signup', 'customers/signup', {
    username: demoEmail, passwd: 'AeliumOte2026!', name: 'Aelium OTE', company: 'Aelium Test S.L.',
    'address-line-1': 'Calle de Prueba 123', city: 'Madrid', state: 'Madrid', country: 'ES',
    zipcode: '28001', 'phone-cc': '34', phone: '600000000', 'lang-pref': 'en',
  }, 'POST');
  const customerId = extractId(signup.response);

  // ─── 3. Contact handle (.com generico) ────────────────────────────────────
  let contactId: string | undefined;
  if (customerId) {
    const contact = await callRc('contact_add', 'contacts/add', {
      name: 'Aelium OTE', company: 'Aelium Test S.L.', email: demoEmail,
      'address-line-1': 'Calle de Prueba 123', city: 'Madrid', state: 'Madrid', country: 'ES',
      zipcode: '28001', 'phone-cc': '34', phone: '600000000', 'customer-id': customerId, type: 'Contact',
    }, 'POST');
    contactId = extractId(contact.response);
  } else {
    skip('contact_add', 'contacts/add', 'sin customer-id (signup no devolvio id)');
  }

  // ─── 4. Register .com ─────────────────────────────────────────────────────
  let orderId: string | undefined;
  if (customerId && contactId) {
    const reg = await callRc('register', 'domains/register', {
      'domain-name': `${label}.com`, years: 1, ns: ['ns1.aelium.net', 'ns2.aelium.net'],
      'customer-id': customerId, 'reg-contact-id': contactId, 'admin-contact-id': contactId,
      'tech-contact-id': contactId, 'billing-contact-id': contactId,
      'invoice-option': 'NoInvoice', 'protect-privacy': false,
    }, 'POST');
    orderId = extractId(reg.response);
  } else {
    skip('register', 'domains/register', 'sin customer-id/contact-id');
  }

  // ─── 5. Details (shape de getServiceInfo) ─────────────────────────────────
  await callRc('details_by_name', 'domains/details-by-name', { 'domain-name': `${label}.com`, options: 'All' }, 'GET');

  // ─── 6. Gestion + renew + suspend/unsuspend (requieren order-id) ──────────
  if (orderId) {
    await callRc('modify_ns', 'domains/modify-ns', { 'order-id': orderId, ns: ['ns1.aelium.net', 'ns2.aelium.net'] }, 'POST');
    await callRc('modify_auth_code', 'domains/modify-auth-code', { 'order-id': orderId, 'auth-code': `Ae${ts}Xz!` }, 'POST');
    await callRc('theft_protection_enable', 'domains/enable-theft-protection', { 'order-id': orderId }, 'POST');
    await callRc('theft_protection_disable', 'domains/disable-theft-protection', { 'order-id': orderId }, 'POST');
    await callRc('renew', 'domains/renew', { 'order-id': orderId, years: 1, 'invoice-option': 'NoInvoice' }, 'POST');
    await callRc('suspend', 'orders/suspend', { 'order-id': orderId, reason: 'OTE research test' }, 'POST');
    await callRc('unsuspend', 'orders/unsuspend', { 'order-id': orderId }, 'POST');
  } else {
    skip('management+renew+suspend', 'domains/* + orders/*', 'sin order-id (register no completo)');
  }

  // ─── Persistir captura cruda (datos demo, SIN credenciales) ───────────────
  const outPath = join(__dirname, '..', '..', 'docs', '_research', 'sprint-15d', 'ote-raw-capture.json');
  writeFileSync(
    outPath,
    JSON.stringify({ capturedAt: new Date().toISOString(), sandbox: SANDBOX_URL, total: findings.length, findings }, null, 2),
    'utf8',
  );
  const okCount = findings.filter((f) => f.ok).length;
  console.log(`\n=== ${findings.length} llamadas · OK ${okCount}/${findings.length} → ${outPath} ===`);
}

void main().catch((e: unknown) => {
  console.error('[research] Error fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});

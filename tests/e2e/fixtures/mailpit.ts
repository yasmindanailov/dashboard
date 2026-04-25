/**
 * Helper para interactuar con MailPit (servidor SMTP de desarrollo + API HTTP).
 *
 * Usado para leer emails enviados durante un test (códigos 2FA, links de
 * verificación, reset de contraseña).
 *
 * Documentación API: https://github.com/axllent/mailpit/wiki/API-v1
 */

import { TEST_CONFIG } from './test-config';

interface MailpitMessage {
  ID: string;
  MessageID: string;
  From: { Address: string; Name: string };
  To: { Address: string; Name: string }[];
  Subject: string;
  Created: string; // ISO date
}

interface MailpitMessageDetail extends MailpitMessage {
  Text: string;
  HTML: string;
}

interface MailpitListResponse {
  total: number;
  count: number;
  messages: MailpitMessage[];
}

/**
 * Borra todos los emails. Llamar al inicio de un test para empezar limpio.
 */
export async function clearMailbox(): Promise<void> {
  const res = await fetch(`${TEST_CONFIG.mailpitUrl}/api/v1/messages`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`MailPit clearMailbox failed: ${res.status} ${res.statusText}`);
  }
}

/**
 * Espera hasta que llegue un email a la dirección dada.
 * Polling cada 500ms hasta el timeout.
 */
export async function waitForEmail(
  toAddress: string,
  options: { timeoutMs?: number; subjectIncludes?: string } = {},
): Promise<MailpitMessageDetail> {
  const { timeoutMs = 15_000, subjectIncludes } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const listRes = await fetch(`${TEST_CONFIG.mailpitUrl}/api/v1/messages?limit=50`);
    if (!listRes.ok) {
      throw new Error(`MailPit list failed: ${listRes.status}`);
    }
    const list = (await listRes.json()) as MailpitListResponse;

    const match = list.messages.find((m) => {
      const matchesAddress = m.To.some((t) => t.Address.toLowerCase() === toAddress.toLowerCase());
      const matchesSubject = subjectIncludes ? m.Subject.includes(subjectIncludes) : true;
      return matchesAddress && matchesSubject;
    });

    if (match) {
      const detailRes = await fetch(`${TEST_CONFIG.mailpitUrl}/api/v1/message/${match.ID}`);
      if (!detailRes.ok) {
        throw new Error(`MailPit message detail failed: ${detailRes.status}`);
      }
      return (await detailRes.json()) as MailpitMessageDetail;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(
    `Timeout esperando email a "${toAddress}"${subjectIncludes ? ` con subject "${subjectIncludes}"` : ''} (${timeoutMs}ms)`,
  );
}

/**
 * Extrae el primer link verify-email del cuerpo de un email.
 * Funciona con el template HTML de auth.templates.ts.
 */
export function extractVerifyEmailLink(message: MailpitMessageDetail): string {
  // Busca primero en HTML, luego en text. Patrón: ?token=XXXXX en /verify-email
  const candidates = [message.HTML, message.Text];
  for (const body of candidates) {
    const match = body?.match(/https?:\/\/[^\s"<>]+\/verify-email\?token=([A-Za-z0-9_-]+)/);
    if (match) return match[0];
  }
  throw new Error(
    `No se encontró link de verify-email en el email. Subject: "${message.Subject}"`,
  );
}

/**
 * Extrae código 2FA numérico (6 dígitos) del cuerpo del email.
 */
export function extract2FACode(message: MailpitMessageDetail): string {
  const candidates = [message.HTML, message.Text];
  for (const body of candidates) {
    // Busca un código de 6 dígitos. El template suele ponerlo en grande.
    const match = body?.match(/\b\d{6}\b/);
    if (match) return match[0];
  }
  throw new Error(`No se encontró código 2FA en el email. Subject: "${message.Subject}"`);
}

/**
 * Extrae link de reset de contraseña.
 */
export function extractResetPasswordLink(message: MailpitMessageDetail): string {
  const candidates = [message.HTML, message.Text];
  for (const body of candidates) {
    const match = body?.match(/https?:\/\/[^\s"<>]+\/reset-password\?token=([A-Za-z0-9_-]+)/);
    if (match) return match[0];
  }
  throw new Error(`No se encontró link de reset-password en el email`);
}

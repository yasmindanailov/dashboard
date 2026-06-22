'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  AlertBanner,
  Button,
  Card,
  CopyableId,
  Textarea,
} from '../../../../components/ui';
import { executeServiceActionAction } from '../../../../_shared/services/_actions';
import type { DomainInfo } from '../../../../lib/api';

/* ═══════════════════════════════════════
   DomainManagement — gestión curada de un dominio (Sprint 15D Fase 15D.F.4).
   Reusa el endpoint genérico POST /services/:id/actions/:slug (handlers F.1).
   Cada control se gatea por presencia del slug en `availableActions` (R4 —
   capability-driven, no hardcode por slug del registrar).
   ═══════════════════════════════════════ */

interface Props {
  serviceId: string;
  domain: DomainInfo;
  actionSlugs: string[];
}

export default function DomainManagement({
  serviceId,
  domain,
  actionSlugs,
}: Props) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [ns, setNs] = useState(domain.nameservers.join('\n'));

  const can = (slug: string) => actionSlugs.includes(slug);

  async function run(
    slug: string,
    payload: Record<string, unknown>,
    opts: { refresh?: boolean } = { refresh: true },
  ): Promise<Record<string, unknown> | null> {
    setRunning(slug);
    setError(null);
    const res = await executeServiceActionAction(serviceId, slug, payload);
    setRunning(null);
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    if (res.result.success === false) {
      setError(res.result.message ?? 'La operación no se pudo completar.');
      return null;
    }
    if (opts.refresh) router.refresh();
    return res.result.data ?? null;
  }

  async function handleAuthCode() {
    const data = await run('get_auth_code', {}, { refresh: false });
    const code = data && typeof data.authCode === 'string' ? data.authCode : null;
    if (code) setAuthCode(code);
    else if (!error)
      setError('El registrar no devolvió un código de autorización.');
  }

  async function handleNameservers() {
    const list = ns
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (list.length < 2) {
      setError('Indica al menos 2 nameservers (uno por línea).');
      return;
    }
    await run('modify_nameservers', { nameservers: list });
  }

  const nothingToManage =
    !can('toggle_privacy') &&
    !can('toggle_registrar_lock') &&
    !can('get_auth_code') &&
    !can('modify_nameservers');

  if (nothingToManage) return null;

  return (
    <Card>
      <div
        style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Gestión</h2>

        {error && <AlertBanner variant="danger">{error}</AlertBanner>}

        {can('modify_nameservers') && (
          <Section
            title="Nameservers"
            hint="Un nameserver por línea (mínimo 2). Cambiarlos puede afectar a tu correo y web."
          >
            <Textarea
              value={ns}
              onChange={(e) => setNs(e.target.value)}
              rows={4}
              placeholder={'ns1.aelium.net\nns2.aelium.net'}
            />
            <div style={{ marginTop: 10 }}>
              <Button
                size="sm"
                onClick={handleNameservers}
                loading={running === 'modify_nameservers'}
              >
                Guardar nameservers
              </Button>
            </div>
          </Section>
        )}

        {can('toggle_privacy') && (
          <Section
            title="Privacidad WHOIS"
            hint={
              domain.whoisPrivacy
                ? 'Tus datos personales están ocultos en el WHOIS público.'
                : 'Tus datos personales son visibles en el WHOIS público.'
            }
          >
            <Button
              variant="secondary"
              size="sm"
              loading={running === 'toggle_privacy'}
              onClick={() =>
                run('toggle_privacy', { enabled: !domain.whoisPrivacy })
              }
            >
              {domain.whoisPrivacy ? 'Desactivar privacidad' : 'Activar privacidad'}
            </Button>
          </Section>
        )}

        {can('toggle_registrar_lock') && (
          <Section
            title="Bloqueo de transferencia"
            hint={
              domain.registrarLock
                ? 'El dominio está protegido frente a transferencias no autorizadas.'
                : 'El dominio NO está protegido frente a transferencias.'
            }
          >
            <Button
              variant="secondary"
              size="sm"
              loading={running === 'toggle_registrar_lock'}
              onClick={() =>
                run('toggle_registrar_lock', { locked: !domain.registrarLock })
              }
            >
              {domain.registrarLock ? 'Desbloquear' : 'Bloquear'}
            </Button>
          </Section>
        )}

        {can('get_auth_code') && (
          <Section
            title="Código de autorización (EPP)"
            hint="Necesario para transferir el dominio a otro registrador."
          >
            {authCode ? (
              <CopyableId id={authCode} label="Código" />
            ) : (
              <Button
                variant="secondary"
                size="sm"
                loading={running === 'get_auth_code'}
                onClick={handleAuthCode}
                disabled={!domain.authCodeAvailable}
              >
                Obtener código
              </Button>
            )}
          </Section>
        )}
      </div>
    </Card>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderTop: '1px solid var(--border-subtle)',
        paddingTop: 16,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
      <div
        style={{
          fontSize: 13,
          color: 'var(--text-tertiary)',
          margin: '2px 0 10px',
        }}
      >
        {hint}
      </div>
      {children}
    </div>
  );
}

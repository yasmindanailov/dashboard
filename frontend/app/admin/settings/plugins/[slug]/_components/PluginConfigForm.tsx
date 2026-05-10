'use client';

import { useState, useTransition } from 'react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { IChangeEvent } from '@rjsf/core';

import type { RJSFSchema } from '@rjsf/utils';

import { Button } from '../../../../../components/ui';
import { t, translateSchema } from '../../../../../_shared/i18n';
import type {
  AdminPluginDetail,
  PluginJsonSchema,
} from '../../../../../lib/api';
import { aeliumDsWidgets } from '../../../../../_shared/plugins/rjsf-theme';
import {
  testConnectionAction,
  togglePluginAction,
  updatePluginAction,
} from '../../_actions';

/**
 * PluginConfigForm — Sprint 15A Fase I.1 (ADR-080 §7).
 *
 * Client component que orquesta:
 *   - Toggle enabled (atajo separado del save de config/secrets para
 *     que el admin pueda desactivar urgentemente sin reescribir la api
 *     key cada vez).
 *   - Form rjsf de `manifest.configSchema` (campos NO secretos).
 *   - Form rjsf de `manifest.secretsSchema` (campos secretos — los
 *     valores existentes vienen como '***' del backend; el admin escribe
 *     los nuevos plaintexts y se cifran server-side).
 *   - Botón "Probar conexión" (solo si manifest.testConnectionMethod !== null).
 *
 * Doctrina:
 *   - Save config y secrets se envían en la MISMA action (parcial-update
 *     atómico) — el backend persiste y emite plugin.config_changed una
 *     sola vez (mejor que dos PATCH consecutivos que dispararían dos
 *     reloads del registry).
 *   - Si el admin no toca el campo de un secret existente (queda como
 *     '***'), NO se envía en el PATCH — el backend preserva el cifrado
 *     anterior. Si el admin escribe un nuevo valor, se envía en
 *     plaintext y el backend lo cifra.
 *   - useTransition envuelve las actions para no bloquear la UI.
 */

interface Props {
  detail: AdminPluginDetail;
}

interface FeedbackState {
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface TestConnectionState {
  success: boolean;
  message: string;
  checkedAt: string;
}

export function PluginConfigForm({ detail }: Props) {
  const [, startTransition] = useTransition();

  // Config: estado controlado a partir del valor server-side.
  const [configValue, setConfigValue] = useState<Record<string, unknown>>(
    detail.config,
  );
  // Secrets: el valor inicial es '' por campo declarado. El admin escribe
  // un valor solo si quiere reemplazar el secret existente. El placeholder
  // visual (debajo) indica si el campo "tiene secret seteado" o no.
  const [secretsDraft, setSecretsDraft] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        Object.keys(detail.manifest.secretsSchema.properties ?? {}).map(
          (k) => [k, ''],
        ),
      ),
  );

  const [enabled, setEnabled] = useState<boolean>(detail.enabled);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [testResult, setTestResult] = useState<TestConnectionState | null>(
    null,
  );
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasSecretsSchema = Object.keys(
    detail.manifest.secretsSchema.properties ?? {},
  ).length > 0;
  const supportsTestConnection = detail.manifest.testConnectionMethod !== null;

  function handleToggleEnabled(): void {
    const next = !enabled;
    setSaving(true);
    setFeedback(null);
    startTransition(async () => {
      const result = await togglePluginAction(detail.slug, next);
      setSaving(false);
      if (result.ok) {
        setEnabled(next);
        setFeedback({
          kind: 'success',
          message: next ? 'Plugin habilitado.' : 'Plugin deshabilitado.',
        });
      } else {
        setFeedback({ kind: 'error', message: result.error });
      }
    });
  }

  function handleSave(): void {
    setSaving(true);
    setFeedback(null);

    // Solo enviamos secrets que el admin ha escrito (no '').
    const secretsToSend: Record<string, string> = {};
    for (const [key, value] of Object.entries(secretsDraft)) {
      if (value && value.length > 0) {
        secretsToSend[key] = value;
      }
    }

    const body: Parameters<typeof updatePluginAction>[1] = {
      config: configValue,
    };
    if (Object.keys(secretsToSend).length > 0) {
      body.secrets = secretsToSend;
    }

    startTransition(async () => {
      const result = await updatePluginAction(detail.slug, body);
      setSaving(false);
      if (result.ok) {
        setFeedback({ kind: 'success', message: 'Cambios guardados.' });
        // Limpiar drafts de secrets — los valores nuevos ya están cifrados.
        setSecretsDraft((prev) =>
          Object.fromEntries(Object.keys(prev).map((k) => [k, ''])),
        );
      } else {
        setFeedback({ kind: 'error', message: result.error });
      }
    });
  }

  function handleTestConnection(): void {
    setTesting(true);
    setTestResult(null);
    startTransition(async () => {
      const result = await testConnectionAction(detail.slug);
      setTesting(false);
      if (result.ok) {
        setTestResult({
          success: result.data.success,
          message: result.data.message,
          checkedAt: result.data.checked_at,
        });
      } else {
        setTestResult({
          success: false,
          message: result.error,
          checkedAt: new Date().toISOString(),
        });
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ── Toggle enabled ─────────────────────────────────────────── */}
      <section
        style={{
          padding: 16,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            Estado del plugin
          </h2>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}
          >
            {enabled
              ? 'El plugin está activo. Servicios cuyo provisioner_slug coincida con este se procesarán automáticamente.'
              : 'El plugin está deshabilitado. Servicios afectados quedarán en pending hasta que se habilite.'}
          </p>
        </div>
        <Button
          variant={enabled ? 'secondary' : 'primary'}
          onClick={handleToggleEnabled}
          disabled={saving}
        >
          {enabled ? 'Deshabilitar' : 'Habilitar'}
        </Button>
      </section>

      {/* ── Config form ────────────────────────────────────────────── */}
      <section
        style={{
          padding: 16,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}
      >
        <h2
          style={{
            margin: '0 0 12px',
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          Configuración
        </h2>
        {Object.keys(detail.manifest.configSchema.properties ?? {}).length === 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
            }}
          >
            Este plugin no requiere configuración.
          </p>
        ) : (
          <Form
            schema={translateSchema(detail.manifest.configSchema as unknown as RJSFSchema)}
            formData={configValue}
            widgets={aeliumDsWidgets}
            validator={validator}
            onChange={(e: IChangeEvent) =>
              setConfigValue(
                (e.formData ?? {}) as Record<string, unknown>,
              )
            }
            uiSchema={{ 'ui:submitButtonOptions': { norender: true } }}
            showErrorList={false}
          />
        )}
      </section>

      {/* ── Secrets form (manual, no rjsf — debe controlar visualmente
            el "está seteado / cambiar") ──────────────────────────── */}
      {hasSecretsSchema && (
        <section
          style={{
            padding: 16,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
          }}
        >
          <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>
            Credenciales
          </h2>
          <p
            style={{
              margin: '0 0 16px',
              fontSize: 12,
              color: 'var(--text-secondary)',
            }}
          >
            Cifradas con AES-256-GCM antes de persistirse. Deja un campo
            vacío para preservar el valor existente (***).
          </p>
          <SecretsFields
            schema={detail.manifest.secretsSchema}
            existing={detail.secrets}
            draft={secretsDraft}
            onChange={(field, value) =>
              setSecretsDraft((prev) => ({ ...prev, [field]: value }))
            }
          />
        </section>
      )}

      {/* ── Action bar ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {supportsTestConnection && (
          <Button
            variant="secondary"
            onClick={handleTestConnection}
            disabled={testing}
          >
            {testing ? 'Probando…' : 'Probar conexión'}
          </Button>
        )}
        {feedback && <FeedbackInline feedback={feedback} />}
      </div>

      {testResult && <TestConnectionInline result={testResult} />}
    </div>
  );
}

/** ─── Sub-componentes inline ─── */

function SecretsFields({
  schema,
  existing,
  draft,
  onChange,
}: {
  schema: PluginJsonSchema;
  existing: Record<string, '***' | null>;
  draft: Record<string, string>;
  onChange: (field: string, value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Object.entries(schema.properties).map(([field, prop]) => {
        const isSet = existing[field] === '***';
        const placeholder = isSet
          ? '*** (deja vacío para mantener el valor actual)'
          : 'Sin valor configurado';
        return (
          <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {field}
              {schema.required?.includes(field) ? ' *' : ''}
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={draft[field] ?? ''}
              placeholder={placeholder}
              onChange={(e) => onChange(field, e.target.value)}
              style={{
                padding: '8px 12px',
                fontSize: 14,
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--surface-secondary)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            />
            {prop.description && (
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {t(prop.description)}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

function FeedbackInline({ feedback }: { feedback: FeedbackState }) {
  const colorMap = {
    success: { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46' },
    error: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
    info: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF' },
  } as const;
  const c = colorMap[feedback.kind];
  return (
    <div
      role="status"
      style={{
        padding: '6px 12px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        borderRadius: 6,
        fontSize: 13,
      }}
    >
      {feedback.message}
    </div>
  );
}

function TestConnectionInline({ result }: { result: TestConnectionState }) {
  const ok = result.success;
  return (
    <div
      role="status"
      style={{
        padding: 12,
        background: ok ? '#ECFDF5' : '#FEF2F2',
        border: `1px solid ${ok ? '#A7F3D0' : '#FECACA'}`,
        color: ok ? '#065F46' : '#991B1B',
        borderRadius: 8,
        fontSize: 13,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <strong>{ok ? '✓ Conexión OK' : '✗ Error de conexión'}</strong>
      <span>{result.message}</span>
      <span style={{ fontSize: 11, opacity: 0.7 }}>
        Probado: {new Date(result.checkedAt).toLocaleString('es-ES')}
      </span>
    </div>
  );
}

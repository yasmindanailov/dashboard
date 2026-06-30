'use client';

import { useState, useTransition } from 'react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { IChangeEvent } from '@rjsf/core';

import type { RJSFSchema } from '@rjsf/utils';

import { Button, useToast } from '../../../../../components/ui';
import { t, translateSchema } from '../../../../../_shared/i18n';
import type {
  AdminPluginDetail,
  PluginJsonSchema,
} from '../../../../../lib/api';
import {
  aeliumDsTemplates,
  aeliumDsWidgets,
} from '../../../../../_shared/plugins/rjsf-theme';
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

interface TestConnectionState {
  success: boolean;
  message: string;
  checkedAt: string;
}

export function PluginConfigForm({ detail }: Props) {
  const [, startTransition] = useTransition();
  // Sprint 15C.II Fase C (gap G6 — UI_SPEC §4.3): feedback de toggle/save
  // migrado de `<FeedbackInline>` (state local + render junto al botón)
  // a `useToast()` (esquina superior derecha, 5s, esquema canónico).
  // Antes: violaba la doctrina (Toast = efímero, AlertBanner = persistente)
  // y daba feedback poco visible en una página con scroll. Ahora coherente
  // con ActionsBar.tsx + SsoButton.tsx (Sprint 15C Fase I) + el resto del
  // frontend (productos, billing, support).
  // El `<TestConnectionInline>` se mantiene inline (NO toast) porque el
  // resultado de "Probar conexión" tiene contenido detallado (mensaje +
  // checkedAt) y el admin necesita revisarlo durante varios segundos —
  // patrón `AlertBanner persistente` (UI_SPEC §4.3).
  const { toast } = useToast();

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
  const [testResult, setTestResult] = useState<TestConnectionState | null>(
    null,
  );
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasSecretsSchema = Object.keys(
    detail.manifest.secretsSchema.properties ?? {},
  ).length > 0;
  const supportsTestConnection = detail.manifest.testConnectionMethod !== null;
  // F3·E13 Fase E — el copy del toggle difiere para proveedores IA (no
  // aprovisionan servicios; alimentan el copiloto de soporte).
  const isAiPlugin = detail.manifest.settingsCategory === 'ai';

  function handleToggleEnabled(): void {
    const next = !enabled;
    setSaving(true);
    startTransition(async () => {
      const result = await togglePluginAction(detail.slug, next);
      setSaving(false);
      if (result.ok) {
        setEnabled(next);
        toast('success', next ? 'Plugin habilitado.' : 'Plugin deshabilitado.');
      } else {
        toast('error', result.error);
      }
    });
  }

  function handleSave(): void {
    setSaving(true);

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
        toast('success', 'Cambios guardados.');
        // Limpiar drafts de secrets — los valores nuevos ya están cifrados.
        setSecretsDraft((prev) =>
          Object.fromEntries(Object.keys(prev).map((k) => [k, ''])),
        );
      } else {
        toast('error', result.error);
      }
    });
  }

  // Sprint 15C.II Fase F.11.x hot-fix (smoke real Yasmin 2026-05-19):
  // antes el handler envolvía `await testConnectionAction(...)` dentro de
  // `startTransition(async () => ...)` — anti-pattern conocido de React
  // 18: pasar una función `async` a `startTransition` NO marca los
  // `setState` posteriores como transition (silenciosamente), y peor,
  // según versión de React/Next, el setState puede llegar a perderse en
  // race conditions con el unmount/re-render. Yasmin reportó "no devuelve
  // nada, no hay feedback" — efecto exacto.
  //
  // Refactor canónico: async function plain, sin `useTransition`. El
  // estado `testing` ya gestiona la UX de loading (botón disabled +
  // "Probando…"). Heredable: cualquier handler con `await + setState`
  // sigue el mismo patrón.
  async function handleTestConnection(): Promise<void> {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnectionAction(detail.slug);
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
    } catch (err) {
      // Defense-in-depth: si la Server Action lanza una excepción no
      // capturada (network drop, etc.), el panel inline igualmente
      // refleja el error en vez de quedarse vacío. Patrón heredable.
      setTestResult({
        success: false,
        message:
          err instanceof Error ? err.message : 'Error inesperado al probar la conexión.',
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setTesting(false);
    }
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
              ? isAiPlugin
                ? 'El proveedor de IA está activo. El copiloto de soporte usará este proveedor para generar borradores de respuesta.'
                : 'El plugin está activo. Servicios cuyo provisioner_slug coincida con este se procesarán automáticamente.'
              : isAiPlugin
                ? 'El proveedor de IA está deshabilitado. La sugerencia de IA no estará disponible en el composer de soporte.'
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
            templates={aeliumDsTemplates}
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
            schema={
              translateSchema(
                detail.manifest.secretsSchema as unknown as RJSFSchema,
              ) as unknown as PluginJsonSchema
            }
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
            // Sprint 15C.II hot-fix 2026-05-19 (smoke real Yasmin): patrón
            // canónico para handlers async en onClick — envoltura sync con
            // void para que React pase exactamente `() => void` (vs
            // `Promise<void>` ambiguo). Algunas combinaciones React+Next
            // dev (HMR + cliente components) ignoraban el handler async
            // pasado directo.
            onClick={() => {
              void handleTestConnection();
            }}
            disabled={testing}
          >
            {testing ? 'Probando…' : 'Probar conexión'}
          </Button>
        )}
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
        // Sprint 15C.II Fase B fix-up: el title del schema ya viene traducido
        // por translateSchema (caller). Si el plugin no declara title (legacy),
        // fallback al field name. Smoke real Yasmin reportó "apiToken *" crudo.
        const fieldLabel =
          typeof prop.title === 'string' && prop.title.length > 0
            ? prop.title
            : field;
        return (
          <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              {fieldLabel}
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

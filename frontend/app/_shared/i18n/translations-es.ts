/**
 * Sprint 15C Fase 15C.I — traducciones ES de las i18n keys emitidas por
 * plugins de provisioning vía contrato canónico (ADR-077 §2 + ADR-080 §1).
 *
 * Cierra la deuda heredada de Sprints 11/15A: los plugins emiten keys
 * i18n en sus manifest/actions/panel_label, esperando que el frontend
 * traduzca al renderizar. Sin un provider cableado, las keys se mostraban
 * crudas (ej. "plugin.enhance_cp.label" en lugar de "Hosting Enhance" —
 * detectado en smoke manual Yasmin Fase 15C.J).
 *
 * Doctrina (decisión Yasmin Fase I 2026-05-10):
 *
 *   - **Solo ES en v1.** Aelium opera principalmente en español. EN se
 *     diferirá como sub-sprint cuando llegue cliente angloparlante. Esto
 *     ahorra ~30% del esfuerzo de cierre Sprint 15C sin perder cobertura
 *     real para la operativa actual.
 *
 *   - **Translator local minimal en lugar de `next-intl`.** El stack
 *     Next 16.2.4 + React 19.2.4 es cutting-edge y CLAUDE.md frontend
 *     advierte breaking changes (`This is NOT the Next.js you know`).
 *     Instalar un paquete external sin verificar compat añade riesgo
 *     innecesario para una fase de cierre. Para 25 keys ES-only, un
 *     translator de ~15 LOC sin deps cumple el contrato (las keys
 *     crudas dejan de mostrarse) y es directamente reemplazable por
 *     `next-intl` cuando llegue el sub-sprint EN.
 *
 *   - **Alcance: solo `plugin.enhance_cp.*` keys.** El resto del
 *     frontend usa strings hardcoded ES (`"Acciones rápidas"`,
 *     `"Datos del servicio"`, etc.) — esa migración es un sub-sprint
 *     futuro, fuera del alcance Fase I.
 *
 * Deuda registrada (DC.NEW-15C-i18n): cuando llegue cliente EN, este
 * Map se reemplaza por un provider real (`next-intl` con namespace
 * `plugin.enhance_cp` + locale switching basado en cookie). El cambio
 * es localizado: solo `translator.ts` + nuevos archivos `*-en.ts`.
 *
 * Patrón replicable: futuros plugins SaaS (15D RC, 15E Docker, 15G
 * Plesk) añadirán sus propios bloques `plugin.<slug>.*` en este mismo
 * archivo o en archivos hermanos importados aquí.
 */

export const TRANSLATIONS_ES: Readonly<Record<string, string>> = Object.freeze({
  // ── Wrapper backend — keys de error/result genéricos (core/provisioning/plugin-utils.ts)
  // Sprint 15C Fase 15C.I (smoke detectó keys crudas en cliente y admin).
  'action.unknown': 'Acción desconocida o no soportada por este plugin.',
  'action.circuit_open':
    'El proveedor está temporalmente caído. Reintenta en unos minutos — el sistema reintenta solo cada 30 s.',
  'action.invalid_payload':
    'Los datos enviados no cumplen el esquema esperado por la acción.',
  'action.provider_error':
    'El proveedor devolvió un error inesperado. Si persiste, contacta a soporte.',

  // ── Plugin Enhance CP — Manifest (ADR-080 §1 + ADR-083 §1)
  'plugin.enhance_cp.label': 'Hosting Enhance',
  'plugin.enhance_cp.description':
    'Plugin de provisioning para Enhance Control Panel. Aprovisiona hosting compartido vía orchd v12.21.3 — crea customer + suscripción + website automáticamente, abre SSO al panel Enhance, gestiona registros DNS y reconcilia drift cada 6h.',
  'plugin.enhance_cp.panel_label': 'panel Enhance',

  // ── Plugin Enhance CP — Config (ADR-083 §1 decisiones 1-3)
  // Sprint 15C.II Fase B fix-up round 6 (2026-05-10): keys reescritas
  // para que la description NO repita el label (smoke real Yasmin reportó
  // duplicación textual cuando label + description aparecen consecutivos).
  // Convención: label = nombre conciso del campo. Description = info
  // complementaria SIN repetir el nombre.
  'plugin.enhance_cp.config.baseUrl.label': 'URL base de la API Enhance',
  'plugin.enhance_cp.config.baseUrl':
    'Ejemplo: https://enhance.example.com. El plugin añade el prefijo /v2/... automáticamente según el endpoint que invoque.',
  'plugin.enhance_cp.config.masterOrgId.label': 'UUID del Master Org Aelium',
  'plugin.enhance_cp.config.masterOrgId':
    'Owner canónico de todos los customers que el plugin cree (multi-tenancy ADR-083 §2). Se obtiene desde Enhance UI → Settings → Organization.',
  'plugin.enhance_cp.config.reconciliationIntervalHours.label':
    'Intervalo de reconciliación (horas)',
  'plugin.enhance_cp.config.reconciliationIntervalHours':
    'Frecuencia del cron L3 que compara cada servicio Aelium con su Subscription en Enhance. Emite service.reconciled_external_change al detectar drift. Default 6h, recomendado entre 4 y 12.',

  // ── Plugin Enhance CP — Secrets
  'plugin.enhance_cp.secrets.apiToken.label': 'Bearer token API Enhance',
  'plugin.enhance_cp.secrets.apiToken':
    'Token Super Admin generado en Enhance UI → Settings → API tokens. Revocable en cualquier momento desde Enhance. Se cifra con AES-256-GCM antes de persistirse (ADR-080 §3).',

  // ── Plugin Enhance CP — Product config (ADR-080 Amendment B + ADR-083 Amendment A3)
  'plugin.enhance_cp.product_config.enhance_plan_id.label':
    'ID del plan en Enhance',
  'plugin.enhance_cp.product_config.enhance_plan_id':
    'Identificador numérico que se asociará a este producto Aelium como Subscription.planId. El admin crea los planes en Enhance UI; aquí solo se referencia por número (ej. 1, 2, 3…).',

  // ── Plugin Enhance CP — Acciones curadas (ADR-070 §C + ADR-077 Amendment A3)
  'plugin.enhance_cp.actions.reset_password': 'Restablecer contraseña',
  'plugin.enhance_cp.actions.reset_password.confirm':
    'Se generará una contraseña nueva aleatoria y se enviará al email del cliente. La sesión activa se cerrará. ¿Confirmar?',
  'plugin.enhance_cp.actions.reset_password.success':
    'Contraseña restablecida en Enhance. Comparte la nueva manualmente con el cliente — el envío automático por email llegará en una próxima versión.',

  // Sprint 15C.II Fase B: keys 'plugin.enhance_cp.actions.view_disk[*]' y
  // 'plugin.enhance_cp.actions.view_bandwidth[*]' eliminadas — las inline
  // actions correspondientes se removieron del manifest del plugin
  // (ADR-083 Amendment A4.1). Refresh metrics ahora es nativo en MetricsBar
  // vía botón ↻ + server action refreshServiceInfoAction.

  // Refresh metrics canónico (ADR-083 Amendment A4.1)
  'metrics.refresh': 'Refrescar',
  'metrics.refreshing': 'Refrescando…',
  'metrics.refresh.tooltip':
    'Vuelve a consultar las métricas al proveedor (bypass cache 60 s).',
  'metrics.refresh.aria_label': 'Refrescar métricas',
  'metrics.refresh.success': 'Métricas actualizadas.',
  'metrics.refresh.error': 'No se pudieron actualizar las métricas.',

  'plugin.enhance_cp.actions.list_dns_records': 'Listar registros DNS',
  'plugin.enhance_cp.actions.add_dns_record': 'Añadir registro DNS',
  'plugin.enhance_cp.actions.update_dns_record': 'Actualizar registro DNS',
  'plugin.enhance_cp.actions.delete_dns_record': 'Eliminar registro DNS',
  'plugin.enhance_cp.actions.delete_dns_record.confirm':
    'Se eliminará este registro DNS de la zona. La operación es irreversible. ¿Confirmar?',

  'plugin.enhance_cp.actions.change_package': 'Cambiar plan',
  'plugin.enhance_cp.actions.change_package.confirm':
    'Se cambiará el plan de la suscripción Enhance. Esto puede afectar la facturación del próximo ciclo. ¿Confirmar?',
  'plugin.enhance_cp.actions.change_package.success':
    'Plan cambiado correctamente. La metadata local se actualizó (cron L3 ya no detectará drift).',

  // Sprint 15C.II Fase B (ADR-083 Amendment A4.2): rename label
  // "Forzar resincronización" → "Reconciliar contra Enhance" (decisión
  // doctrinal A2 frozen — naming honesto que refleja la operación real
  // de comparar cache local vs Enhance ground truth, no un mero refresh
  // de pantalla).
  'plugin.enhance_cp.actions.force_resync': 'Reconciliar contra Enhance',
  'plugin.enhance_cp.actions.force_resync.description':
    'Reconcilia este servicio contra Enhance ahora — mismo pipeline que el cron L3 que corre cada 6 h, pero single-shot. Útil tras cambios manuales en la UI Enhance que pudieron generar drift.',
  'plugin.enhance_cp.actions.force_resync.success':
    'Reconciliación completada.',

  'plugin.enhance_cp.actions.list_available_plans': 'Listar planes disponibles',

  // Reconcile-all general del plugin (ADR-083 Amendment A4.2 + gap G1)
  'admin.plugins.reconcile_all.section_title':
    'Reconciliación contra el proveedor',
  'admin.plugins.reconcile_all.section_description':
    'Compara todos los servicios activos contra el proveedor y emite eventos de drift si hay discrepancias. El cron L3 lo hace cada 6 h automáticamente; este botón fuerza una pasada manual ahora (útil tras cambios masivos o smoke testing).',
  'admin.plugins.reconcile_all.button': 'Reconciliar todos ahora',
  'admin.plugins.reconcile_all.tooltip':
    'Invoca el executor reconcile registrado por el plugin (POST /admin/plugins/:slug/reconcile-all).',
  'admin.plugins.reconcile_all.loading': 'Reconciliando…',
  // Sprint 15C.II Fase B fix-up (2026-05-10): pluralización ES inline para
  // 1 vs N servicios/drifts (translator local no soporta ICU). Smoke real
  // reportó toast "1 servicios procesados" — ahora es "1 servicio procesado"
  // / "5 servicios procesados" según count.
  'admin.plugins.reconcile_all.success':
    'Reconciliación completada: {processed} {services_label}, {drifts} {drifts_label} ({duration} ms).',
  'admin.plugins.reconcile_all.unit.service.singular': 'servicio procesado',
  'admin.plugins.reconcile_all.unit.service.plural': 'servicios procesados',
  'admin.plugins.reconcile_all.unit.drift.singular': 'drift detectado',
  'admin.plugins.reconcile_all.unit.drift.plural': 'drifts detectados',
  'admin.plugins.reconcile_all.error': 'No se pudo reconciliar el plugin.',

  // ── Service status reasons (ADR-070 §"Patrón de página" — discriminados
  // por rol en Fase C UI_SPEC §4.13). Sprint 15C.II Fase B fix-up: el
  // backend envía estos como i18n keys; ServiceHeader aplica t(). Los
  // mensajes actuales son técnicos visibles a todos los roles — Fase C
  // los discriminará (cliente: mensaje genérico empático sin jerga; admin:
  // AlertBanner warning con mensaje técnico + CTA SSO investigación).
  'service.status_reason.plugin_not_registered':
    'No se ha podido contactar con el proveedor (plugin no registrado).',
  'plugin.enhance_cp.status_reason.not_yet_provisioned':
    'Servicio aún no aprovisionado en el proveedor. Reintentaremos automáticamente; si persiste, contacta con soporte.',
  'plugin.enhance_cp.status_reason.subscription_missing':
    'Suscripción no encontrada en el proveedor (drift detectado). Investigaremos el desincronizado.',
});

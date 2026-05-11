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
  // Sprint 15C.II Fase D (DC.NEW-15CII-EMAIL-RESET + ADR-083 Amendment A4.5):
  // listener `notifications-on-password-reset` activo + plantilla seedeada
  // `service.password_reset`. La nueva password viaja al cliente por email
  // automático tras el éxito del reset; el admin ya NO necesita compartirla
  // manualmente.
  'plugin.enhance_cp.actions.reset_password.description':
    'Genera una contraseña aleatoria nueva en Enhance y la envía al email del cliente. Cierra la sesión actual del usuario en el panel.',
  'plugin.enhance_cp.actions.reset_password.confirm':
    'Se generará una contraseña nueva aleatoria y se enviará al email del cliente. La sesión activa se cerrará. ¿Confirmar?',
  'plugin.enhance_cp.actions.reset_password.success':
    'Contraseña restablecida en Enhance. El cliente recibirá un email automático con la nueva contraseña.',

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
  // Sprint 15C.II Fase C (BUG-15CII-13): description del manifest action.
  'plugin.enhance_cp.actions.change_package.description':
    'Cambia el plan asociado a la suscripción Enhance. Aelium NO genera ajuste automático de invoice — el ajuste prorrateado se emite manualmente desde /admin/billing.',
  'plugin.enhance_cp.actions.change_package.confirm':
    'Se cambiará el plan de la suscripción Enhance. Esto puede afectar la facturación del próximo ciclo. ¿Confirmar?',
  'plugin.enhance_cp.actions.change_package.success':
    'Plan cambiado correctamente. La metadata local se actualizó (cron L3 ya no detectará drift).',

  // Sprint 15C.II Fase E (ADR-083 Amendment A5.1): rename slug
  // `force_resync` → `recalculate_provider_metrics` + naming honesto. La
  // acción NO reconcilia nada (eso es el cron L3) — hace `PUT calculate-
  // resource-usage` para que el proveedor recalcule disco/ancho-de-banda en
  // SU lado, y refresca la lectura. Corrige Amendment A4.2 (que era inexacto:
  // decía "Reconciliar contra Enhance / comparar cache vs ground truth").
  // Se opera desde `AdminServiceOperationsCard` (no la barra genérica).
  'plugin.enhance_cp.actions.recalculate_provider_metrics':
    'Recalcular métricas en el proveedor',
  'plugin.enhance_cp.actions.recalculate_provider_metrics.description':
    'Pide a Enhance que recalcule disco y ancho de banda de esta suscripción en su lado, y refresca la lectura. Distinto de "↻ Refrescar" (que solo re-lee la última métrica ya calculada) y de la reconciliación periódica (cron cada 6 h que detecta drift entre Aelium y Enhance).',
  'plugin.enhance_cp.actions.recalculate_provider_metrics.success':
    'Recálculo solicitado al proveedor. Las métricas se actualizarán en breve.',

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
  // por rol en Fase C UI_SPEC §4.13). Sprint 15C.II Fase C (2026-05-10):
  // discriminación cliente vs admin materializada en `ServiceHeader.tsx`
  // (cliente NO ve estos `statusReason` técnicos, solo el mensaje genérico
  // `service.drift.client_generic` abajo) y en `AdminDriftBanner.tsx`
  // (admin ve el `statusReason` técnico crudo dentro de un AlertBanner
  // warning con CTA SSO + Re-aprovisionar).
  'service.status_reason.plugin_not_registered':
    'No se ha podido contactar con el proveedor (plugin no registrado).',
  'plugin.enhance_cp.status_reason.not_yet_provisioned':
    'Servicio aún no aprovisionado en el proveedor. Reintentaremos automáticamente; si persiste, contacta con soporte.',
  'plugin.enhance_cp.status_reason.subscription_missing':
    'Suscripción no encontrada en el proveedor (drift detectado). Investigaremos el desincronizado.',
  // Sprint 15C.II Fase E (ADR-083 Amendment A5.2): el plan en Enhance
  // (ground truth) difiere del `enhance_plan_id` del producto Aelium.
  // DH-INV-6: Enhance gana — el status canónico no cambia; el admin puede
  // reconciliar la metadata local vía el cron L3 manual.
  'plugin.enhance_cp.status_reason.plan_divergence':
    'El plan en el proveedor no coincide con el plan del producto en Aelium (drift de plan). El proveedor manda — reconcilia para actualizar la metadata local.',

  // ── Drift UX discriminada por rol (UI_SPEC §4.13 + ADR-083 Amendment A4.3
  //    — Sprint 15C.II Fase C 2026-05-10). Heredable a 15D RC, 15E Docker,
  //    15G Plesk: cualquier plugin SaaS que retorne `info.status` ∈
  //    {`unknown`, `failed`} con `info.statusReason` no nulo aplica este
  //    patrón. El frontend NO acopla con `service.provisioner_slug` (R-070
  //    "cero `if (provisioner === 'X')`"). Las keys son universales.
  'service.drift.client_generic':
    'Tu servicio está temporalmente no disponible. Hemos avisado al equipo técnico — no necesitas hacer nada.',
  'service.drift.admin_banner.title': 'Drift detectado',
  'service.drift.admin_banner.cta_investigate':
    'Investigar en panel del proveedor',
  'service.drift.admin_banner.reprovision_cta': 'Re-aprovisionar ahora',
  'service.drift.admin_banner.reprovision_help':
    'Re-aprovisiona el servicio contra el proveedor con la metadata actual del producto Aelium. Útil cuando el plugin reporta `not_yet_provisioned` (metadata externa perdida o servicio nunca creado en el proveedor).',
  'service.drift.admin_banner.reprovision_success':
    'Re-aprovisión enqueued. La cola la procesará en segundos.',
  'service.drift.admin_banner.reprovision_error':
    'No se pudo enqueuear la re-aprovisión. Revisa los logs del backend.',

  // ── Estados terminales — service.status ∈ {cancelled, terminated}
  //    (UI_SPEC §4.13 + ADR-082 DH-INV-6 — Sprint 15C.II Fase C round 4
  //    2026-05-10). Doctrina canónica: cuando un service está terminal,
  //    NO se renderiza drift UX (sería semánticamente falso) — se
  //    muestra un banner explícito + se ocultan acciones futiles
  //    (SSO, reprovision, métricas). Heredable a 15D RC, 15E Docker,
  //    15G Plesk: cualquier service cancelled aplica el mismo patrón.
  //
  //    Discriminación cliente vs admin igual que drift UX:
  //    - Cliente: mensaje empático sin tecnicismos.
  //    - Admin: razón técnica cruda + fecha + contexto operativo.
  'service.terminal.cancelled.admin.title': 'Servicio cancelado',
  'service.terminal.cancelled.admin.body':
    'Este servicio está en estado terminal. La cola de provisioning skipea cualquier job sobre él. Para reactivarlo, el cliente debe contratar uno nuevo (checkout) o el admin debe corregir la causa y crear un service nuevo.',
  'service.terminal.cancelled.client.title': 'Servicio cancelado',
  'service.terminal.cancelled.client.body':
    'Este servicio fue cancelado y ya no está activo. Si crees que es un error o quieres contratarlo de nuevo, contacta con soporte.',
  // Razones técnicas mapeadas (lo emite buildTerminalStatusReasonKey
  // en el backend a partir de `service.cancellation_reason`).
  'service.terminal.cancelled.reason.provisioning_failed':
    'No se pudo crear el servicio en el proveedor (fallo permanente — típicamente configuración del producto incompleta o credenciales del plugin inválidas). Revisa la configuración del producto en /admin/products y el plugin en /admin/settings/plugins.',
  'service.terminal.cancelled.reason.admin_action':
    'Cancelado manualmente por un admin. Revisa el motivo exacto en el campo "cancellation_reason" del audit log.',
  'service.terminal.cancelled.reason.unknown':
    'No se registró razón técnica de la cancelación.',

  // ── Action / SSO error code discriminado por rol (Sprint 15C.II Fase
  //    C round 5+6 — smoke real Yasmin 2026-05-10). Backend wrappers
  //    distinguen 3 categorías de error (INVALID_PAYLOAD, INVALID_STATE,
  //    resto). El frontend además discrimina cliente vs admin (UI_SPEC
  //    §1.2 P5 voz Aelium + P6 contenido adaptativo por rol):
  //      - Cliente: voz empática sin tecnicismos (no menciona "drift",
  //        "reconciliar", "metadata local", etc).
  //      - Admin:   operacional con CTA concreto al recovery action
  //        ("Reconciliar todos los servicios ahora" en la página settings
  //        del plugin — el cron L3 manual que re-sincroniza el mapping).
  //    Las keys `action.invalid_payload` + `action.provider_error` +
  //    `action.circuit_open` ya existen desde Fase I (líneas 45-51 arriba)
  //    y NO se duplican aquí — son válidas para ambos roles (errors
  //    canónicos de form/red/circuit que cliente y admin ven igual).
  //    Heredable a 15D RC, 15E Docker, 15G Plesk.
  'action.invalid_state.client':
    'No se pudo completar la acción ahora mismo. Hemos avisado al equipo técnico — vuelve a intentarlo en unos minutos.',
  'action.invalid_state.admin':
    'Drift detectado: el proveedor reporta INVALID_STATE (recurso ausente — login/member/subscription stale en Aelium). Recovery: pulsa "Reconciliar todos los servicios ahora" en /admin/settings/plugins/enhance-cp para re-sincronizar el mapping enhance_customers, o investiga vía SSO al panel del proveedor.',
  'sso.error.invalid_state.client':
    'No podemos abrir el panel ahora mismo. Hemos avisado al equipo técnico — vuelve a intentarlo en unos minutos.',
  'sso.error.invalid_state.admin':
    'Drift SSO: el proveedor no encuentra el customer/login mapeado en enhance_customers (típicamente borrado en panel del proveedor o mock reseteado en dev). Recovery: pulsa "Reconciliar todos los servicios ahora" en /admin/settings/plugins/enhance-cp para re-sincronizar la metadata; si persiste, considera DELETE FROM enhance_customers WHERE user_id=… + reaprovisionar.',
  'sso.error.provider_internal.client':
    'No podemos abrir el panel ahora mismo. Vuelve a intentarlo en unos minutos.',
  'sso.error.provider_internal.admin':
    'El proveedor devolvió un error interno o no reachable. Revisa connectivity al endpoint del plugin (/admin/settings/plugins) y los logs backend.',
  'sso.error.circuit_open.client':
    'El servicio está temporalmente saturado. Vuelve a intentarlo en unos minutos.',
  'sso.error.circuit_open.admin':
    'Circuit breaker open en el plugin (umbral de fallos consecutivos superado). Auto-recovery en ~30s; revisa /admin/observability si persiste.',
});

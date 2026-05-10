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
  'plugin.enhance_cp.config.baseUrl':
    'URL base de la API Enhance (ej. https://enhance.example.com). El plugin añade el prefijo /v2/... según corresponda.',
  'plugin.enhance_cp.config.masterOrgId':
    'UUID del Master Org Aelium en Enhance — owner canónico de todos los customers que el plugin cree (multi-tenancy ADR-083 §2).',
  'plugin.enhance_cp.config.reconciliationIntervalHours':
    'Intervalo del cron L3 de reconciliación (default 6h). El cron compara cada servicio Aelium con su Subscription en Enhance y emite service.reconciled_external_change si detecta drift.',

  // ── Plugin Enhance CP — Secrets
  'plugin.enhance_cp.secrets.apiToken':
    'Bearer token Super Admin Enhance — revocable desde la UI Enhance. Se cifra con AES-256-GCM antes de persistirse (ADR-080 §3).',

  // ── Plugin Enhance CP — Product config (ADR-080 Amendment B + ADR-083 Amendment A3)
  'plugin.enhance_cp.product_config.enhance_plan_id':
    'ID numérico del plan en Enhance que se asociará a este producto Aelium (Subscription.planId). El admin crea los planes en Enhance UI; aquí se referencia por número.',

  // ── Plugin Enhance CP — Acciones curadas (ADR-070 §C + ADR-077 Amendment A3)
  'plugin.enhance_cp.actions.reset_password': 'Restablecer contraseña',
  'plugin.enhance_cp.actions.reset_password.confirm':
    'Se generará una contraseña nueva aleatoria y se enviará al email del cliente. La sesión activa se cerrará. ¿Confirmar?',
  'plugin.enhance_cp.actions.reset_password.success':
    'Contraseña restablecida en Enhance. Comparte la nueva manualmente con el cliente — el envío automático por email llegará en una próxima versión.',

  'plugin.enhance_cp.actions.view_disk': 'Ver uso de disco',
  'plugin.enhance_cp.actions.view_disk.description':
    'Refresca la cache de métricas de disco. Los valores ya visibles en la card "Métricas" se actualizan al instante (TTL 60 s).',
  'plugin.enhance_cp.actions.view_bandwidth': 'Ver uso de ancho de banda',
  'plugin.enhance_cp.actions.view_bandwidth.description':
    'Refresca la cache de bandwidth. Los valores ya visibles en la card "Métricas" se actualizan al instante (TTL 60 s).',

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

  'plugin.enhance_cp.actions.force_resync': 'Forzar resincronización',
  'plugin.enhance_cp.actions.force_resync.description':
    'Reconcilia este servicio contra Enhance ahora — mismo pipeline que el cron L3 que corre cada 6 h, pero single-shot. Útil tras cambios manuales en la UI Enhance que pudieron generar drift.',
  'plugin.enhance_cp.actions.force_resync.success':
    'Reconciliación forzada completada.',

  'plugin.enhance_cp.actions.list_available_plans': 'Listar planes disponibles',
});

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

  // ── Plugin Anthropic (Claude) — subsistema IA paralelo (ADR-080 Amendment D, F3·E13)
  'plugin.anthropic.label': 'Sugerencia IA (Claude)',
  'plugin.anthropic.description':
    'Proveedor de IA del copiloto de soporte. Genera un borrador de respuesta para el agente desde el chat o ticket — nunca se auto-envía: el agente lo revisa e inserta. Usa modelos Claude de Anthropic; la API key se cifra con AES-256-GCM antes de persistirse.',
  'plugin.anthropic.config.model.label': 'Modelo de Claude',
  'plugin.anthropic.config.model':
    'Modelo usado para las sugerencias. Por defecto el más capaz (claude-opus-4-8).',
  'plugin.anthropic.config.max_tokens.label': 'Máximo de tokens',
  'plugin.anthropic.config.max_tokens':
    'Longitud máxima del borrador generado (entre 256 y 4096).',
  'plugin.anthropic.secrets.api_key.label': 'API key de Anthropic',
  'plugin.anthropic.secrets.api_key':
    'Clave de la API de Anthropic (formato sk-ant-…). Sin clave configurada, el sistema responde con un borrador de demostración (stub) sin red ni coste.',

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
  // Sprint 15C.II Fase F.8 (frozen 2026-05-16 — dossier §A.11.10.5.1 R4).
  'plugin.enhance_cp.config.quota_alert_threshold_pct.label':
    'Umbral de alerta de cuota de disco (%)',
  'plugin.enhance_cp.config.quota_alert_threshold_pct':
    'Porcentaje a partir del cual el cron L3 detecta el cruce y notifica al cliente que está cerca de llenar su almacenamiento (un solo email por transición, sin spam). Default 85, recomendado entre 80 y 90. Valores ≥95% se reservan al aviso crítico hardcoded (no configurable).',

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

  // Sprint 15C.II Fase F (ADR-077 Amendment A4): suspend/unsuspend. Las 2
  // inline actions canónicas (adminOnly) que materializan la capability
  // `supports_suspend`. Se operan desde `AdminServiceOperationsCard`
  // ("Suspender servicio…" / "Reanudar servicio") vía el endpoint dedicado
  // `POST /admin/services/:id/suspend|unsuspend` — están en `INTERNAL_HELPER_SLUGS`
  // del `ActionsBar`. El cliente nunca las ve.
  'plugin.enhance_cp.actions.suspend_service': 'Suspender servicio',
  'plugin.enhance_cp.actions.suspend_service.description':
    'Desactiva la suscripción en el proveedor preservando los datos (reversible). Para impago temporal, abuso en investigación, mantenimiento programado o restricción RGPD.',
  'plugin.enhance_cp.actions.suspend_service.confirm':
    '¿Suspender este servicio? El cliente perderá el acceso, pero sus datos se conservan. Es reversible.',
  'plugin.enhance_cp.actions.suspend_service.success':
    'Servicio suspendido en el proveedor.',
  'plugin.enhance_cp.actions.unsuspend_service': 'Reanudar servicio',
  'plugin.enhance_cp.actions.unsuspend_service.description':
    'Reactiva una suscripción suspendida — el cliente recupera el acceso.',
  'plugin.enhance_cp.actions.unsuspend_service.confirm':
    '¿Reanudar este servicio? El cliente recuperará el acceso.',
  'plugin.enhance_cp.actions.unsuspend_service.success':
    'Servicio reactivado en el proveedor.',

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

  // ── Resumen operativo del plugin — Sprint 15C.II Fase F.2
  //    (ADR-083 Amendment A4.4 — `<PluginOperationalOverview>`).
  'admin.plugins.overview.section_title': 'Resumen operativo',
  'admin.plugins.overview.section_description':
    'Estado en esta instancia del backend. Los estados de circuit breaker son in-process y no se comparten entre instancias.',
  'admin.plugins.overview.load_error':
    'No se pudo cargar el resumen operativo del plugin.',
  'admin.plugins.overview.health.operational': 'Operativo',
  'admin.plugins.overview.health.degraded': 'Degradado',
  'admin.plugins.overview.health.down': 'Caído',
  'admin.plugins.overview.health.disabled': 'Deshabilitado',
  'admin.plugins.overview.health_reason.all_clear':
    'Sin incidencias detectadas.',
  'admin.plugins.overview.health_reason.disabled':
    'El plugin está deshabilitado.',
  'admin.plugins.overview.health_reason.circuit_open':
    'Un circuit breaker está abierto — las llamadas al proveedor están bloqueadas temporalmente.',
  'admin.plugins.overview.health_reason.circuit_recovering':
    'Un circuit breaker está en recuperación (half-open).',
  'admin.plugins.overview.health_reason.missing_secrets':
    'Faltan credenciales requeridas por el manifest del plugin.',
  'admin.plugins.overview.health_reason.reconcile_errors':
    'La última reconciliación terminó con errores.',
  'admin.plugins.overview.stat.services_active': 'Servicios activos',
  'admin.plugins.overview.stat.services_suspended': 'Servicios suspendidos',
  'admin.plugins.overview.stat.drifts_24h': 'Drifts (24 h)',
  'admin.plugins.overview.stat.circuit': 'Circuit breaker',
  'admin.plugins.overview.circuit.state.idle': 'Sin actividad',
  'admin.plugins.overview.circuit.state.closed': 'OK',
  'admin.plugins.overview.circuit.state.open': 'Abierto',
  'admin.plugins.overview.circuit.state.half_open': 'Recuperando',
  'admin.plugins.overview.reconcile.last': 'Última reconciliación',
  'admin.plugins.overview.reconcile.never':
    'Aún no se ha ejecutado ninguna reconciliación.',
  'admin.plugins.overview.reconcile.next': 'Próxima programada',
  'admin.plugins.overview.reconcile.trigger.cron': 'automática',
  'admin.plugins.overview.reconcile.trigger.manual': 'manual',
  'admin.plugins.overview.reconcile.services': 'servicios',
  'admin.plugins.overview.reconcile.drifts': 'drifts',
  'admin.plugins.overview.reconcile.errors': 'errores',
  'admin.plugins.overview.reconcile.not_supported':
    'Este plugin no mantiene estado externo sincronizado por cron.',
  'admin.plugins.overview.drifts.title': 'Drifts recientes (24 h)',
  'admin.plugins.overview.drifts.empty':
    'Sin divergencias detectadas en las últimas 24 horas.',
  'admin.plugins.overview.drifts.col.service': 'Servicio',
  'admin.plugins.overview.drifts.col.type': 'Tipo',
  'admin.plugins.overview.drifts.col.detected': 'Detectado',
  'admin.plugins.overview.drift.subscription_missing':
    'Suscripción ausente en el proveedor',
  'admin.plugins.overview.drift.status_divergence': 'Divergencia de estado',
  'admin.plugins.overview.drift.plan_divergence': 'Divergencia de plan',

  // ── Timeline de auditoría per-servicio — Sprint 15C.II Fase F.3 (GAP-15CII-M).
  'service.audit.title': 'Historial de auditoría',
  'service.audit.subtitle_admin':
    'Todos los eventos registrados sobre este servicio: cambios de estado, acciones ejecutadas, accesos del equipo y reconciliaciones contra el proveedor.',
  'service.audit.subtitle_client':
    'Eventos registrados sobre tu servicio que te conciernen, incluidos los accesos de nuestro equipo al panel de tu proveedor.',
  'service.audit.back_admin': 'Volver al servicio',
  'service.audit.back_client': 'Volver al servicio',
  'service.audit.empty': 'Sin eventos registrados todavía.',
  'service.audit.load_more': 'Cargar más eventos',
  'service.audit.system': 'Sistema',
  'service.audit.link': 'Ver historial de auditoría',
  'service.audit.detail.panel': 'Panel',
  'service.audit.detail.change_type': 'Tipo de cambio',
  'service.audit.detail.changes': 'Ver detalles del cambio',
  'service.audit.change_type.subscription_missing':
    'Suscripción ausente en el proveedor',
  'service.audit.change_type.status_divergence': 'Divergencia de estado',
  'service.audit.change_type.plan_divergence': 'Divergencia de plan',
  'service.audit.action.read': 'Acceso de un agente al servicio',
  'service.audit.action.admin_sso_impersonation':
    'Un agente abrió el panel del proveedor de tu servicio',
  'service.audit.action.service.provisioned': 'Servicio aprovisionado',
  'service.audit.action.service.activated': 'Servicio activado',
  'service.audit.action.service.suspended': 'Servicio suspendido',
  'service.audit.action.service.unsuspended': 'Servicio reanudado',
  'service.audit.action.service.deprovisioned_admin': 'Servicio cancelado',
  'service.audit.action.service.reprovision_requested':
    'Re-aprovisionamiento solicitado',
  'service.audit.action.reconciled_external_change':
    'Cambio detectado en el proveedor',
  // Roles (etiqueta legible del actor en el timeline; fallback al slug).
  'role.superadmin': 'Superadmin',
  'role.agent_full': 'Agente',
  'role.agent_billing': 'Agente de facturación',
  'role.agent_support': 'Agente de soporte',
  'role.client': 'Cliente',
  'role.partner': 'Partner',

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
  // Sprint 15C.II Fase F (ADR-077 Amendment A4): subscription suspendida en el
  // proveedor. Cliente-segura — el ServiceHeader la muestra al cliente; el
  // motivo REAL (taxonomía canónica + nota interna) lo ve el admin en el banner
  // amarillo de `/admin/services/[id]` (campo `services.suspension_reason`).
  'plugin.enhance_cp.status_reason.suspended':
    'Servicio suspendido temporalmente. El equipo de soporte tiene el detalle — contacta con nosotros si necesitas más información.',

  // ── Motivos de suspensión — taxonomía canónica `SuspensionReason`
  //    (ADR-077 Amendment A4, Sprint 15C.II Fase F). Cliente-segura: la UI
  //    muestra estas etiquetas (en el email al cliente — backend
  //    `SUSPENSION_REASON_LABEL_ES` del listener — y en el banner admin de
  //    `/admin/services/[id]`). NUNCA se muestra la nota interna del admin.
  //    Para `other` el cliente recibe un email genérico que dirige a soporte.
  'service.suspension_reason.overdue_payment': 'Falta de pago',
  'service.suspension_reason.abuse_investigation':
    'Revisión de seguridad en curso',
  'service.suspension_reason.scheduled_maintenance': 'Mantenimiento programado',
  'service.suspension_reason.gdpr_restriction':
    'Restricción del tratamiento (RGPD art. 18)',
  'service.suspension_reason.other': 'Otros motivos',

  // ── Banner de suspensión del cliente (Sprint 15C.II Fase F.4.2). El cliente
  //    ve el motivo cliente-seguro (etiqueta `service.suspension_reason.*` —
  //    NUNCA la nota interna del admin) + un CTA según el motivo: impago →
  //    regularizar pago; resto → soporte. Mientras esté suspendido se ocultan
  //    SSO + acciones inline + DNS en `/dashboard/services/[id]`.
  'service.suspended.client.title': 'Tu servicio está suspendido',
  'service.suspended.client.body':
    'El acceso a este servicio está temporalmente suspendido. Tus datos se conservan; en cuanto se resuelva, lo reactivaremos.',
  'service.suspended.client.reason_label': 'Motivo',
  'service.suspended.client.cta_pay': 'Regularizar el pago',
  'service.suspended.client.cta_support': 'Contactar con soporte',

  // ── Layout canónico del detalle de servicio (Sprint 15C.II Fase F.12.3).
  //    Copys del frame (tabs + cabecera + secciones genéricas) — voz de marca
  //    centralizada (UI_SPEC §1.2 P5 + regla D11). Provisioner-agnóstico: las
  //    secciones se gatean por capability, no por tipo de producto.
  'service.detail.tab.summary': 'Resumen',
  'service.detail.tab.management': 'Gestión',
  'service.detail.tab.activity': 'Actividad',
  'service.detail.back_client': 'Mis servicios',
  'service.detail.back_admin': 'Servicios',
  'service.detail.details.title': 'Detalles del servicio',
  'service.detail.details.plan': 'Plan',
  'service.detail.details.status': 'Estado de tu servicio',
  'service.detail.details.created': 'Contratado el',
  'service.detail.sso.title': 'Panel del proveedor',
  'service.detail.sso.desc_client':
    'Accede al panel especializado para operaciones avanzadas (gestión de email, bases de datos, archivos…). La sesión se abre en una nueva pestaña con un token temporal y queda registrada en tu portal de transparencia.',
  'service.detail.sso.desc_admin':
    'Abrir el panel del proveedor como admin se registra automáticamente como impersonation en el log GDPR del cliente afectado (portal de transparencia).',
  'service.detail.dns.title_client': 'DNS de tu dominio',
  'service.detail.dns.title_admin': 'Gestión DNS',
  'service.detail.dns.desc_client':
    'Crea, edita o elimina registros DNS (A, AAAA, CNAME, MX, TXT, SRV, CAA) de la zona autoritativa gestionada por Aelium. Los cambios pueden tardar minutos en propagarse.',
  'service.detail.dns.desc_admin':
    'Revisa y edita los registros DNS de la zona de este servicio. Los cambios se aplican directamente en el proveedor.',
  'service.detail.dns.cta': 'Gestionar DNS',
  'service.detail.dev_custom.title': '¿Necesitas un desarrollo a medida?',
  'service.detail.dev_custom.body':
    'Próximamente podrás solicitar un desarrollo personalizado vinculado a este servicio. (Función disponible cuando Sprint 22 Projects esté activo.)',
  'service.detail.meta.contracted': 'Contratado',
  'service.detail.meta.renews': 'Renueva',
  'service.detail.meta.client': 'Cliente',
  'service.detail.actions.more': 'Más acciones',
  'service.detail.fetched_at': 'Última lectura del proveedor:',
  'service.detail.cancelled_at': 'Cancelado el',
  'service.detail.suspended_at': 'Suspendido el',
  'service.detail.suspended_admin.title': 'Servicio suspendido',
  'service.detail.suspended_admin.body':
    'Este servicio está suspendido — el cliente no tiene acceso, pero sus datos se conservan en el proveedor. Reactívalo desde «Operaciones admin» cuando proceda.',
  'service.detail.suspended_admin.reason_label': 'Motivo',

  // ── Aviso de desincronización del estado de suspensión (Sprint 15C.II Fase
  //    F.4.1+F.4.3). Solo admin (`/admin/services/[id]`): `services.status`
  //    (autoritativo para el lifecycle administrativo) no coincide con el que
  //    reporta el proveedor. Informa, no bloquea — ofrece el realineado
  //    idempotente (`POST /admin/services/:id/resync-provider-state`), que NO
  //    es una transición de lifecycle (no escribe la BD, no notifica al
  //    cliente, no emite `service.suspended`/`unsuspended`).
  'service.provider_state_desync.admin.title':
    'El proveedor no refleja el estado de suspensión',
  'service.provider_state_desync.admin.body':
    'El estado de suspensión registrado en Aelium no coincide con el del proveedor. Puede pasar tras un cambio directo en el panel del proveedor, un reinicio del entorno de pruebas o un proceso interno a medias. No bloquea nada, pero conviene realinearlo.',
  'service.provider_state_desync.admin.aelium_state': 'Estado en Aelium',
  'service.provider_state_desync.admin.target_suspended': 'suspendido',
  'service.provider_state_desync.admin.target_active': 'activo',
  'service.provider_state_desync.admin.resync_cta':
    'Realinear estado del proveedor',
  'service.provider_state_desync.admin.resync_help':
    'Re-aplica en el proveedor el estado de suspensión que Aelium tiene registrado. Acción idempotente — no cambia el lifecycle del servicio, no notifica al cliente, no registra una nueva transición.',
  'service.provider_state_desync.admin.resync_success':
    'Estado del proveedor realineado.',
  'service.provider_state_desync.admin.resync_error':
    'No se pudo realinear el estado del proveedor. Revisa los logs del backend.',
  'service.provider_state_desync.admin.confirm_suspend':
    '¿Re-aplicar la suspensión en el proveedor? El servicio quedará suspendido también en el proveedor, coincidiendo con el registro de Aelium. No se notifica al cliente ni se registra una nueva transición de lifecycle.',
  'service.provider_state_desync.admin.confirm_active':
    '¿Reactivar el servicio en el proveedor? El servicio quedará activo también en el proveedor, coincidiendo con el registro de Aelium. No se notifica al cliente ni se registra una nueva transición de lifecycle.',

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
  // Sprint 15C.II Fase F.3 — CTA cuando `recoveryHint === 'reconcile'`
  // (p.ej. plan_divergence): lleva a la página de settings del plugin, donde
  // está el botón "Reconciliar todos los servicios contra <Plugin> ahora"
  // (trigger manual del cron L3) + el overview operativo.
  'service.drift.admin_banner.reconcile_cta': 'Reconciliar contra el proveedor',
  'service.drift.admin_banner.reconcile_help':
    'Abre la configuración del plugin, donde puedes lanzar una reconciliación contra el proveedor ahora (sin esperar al cron periódico) y revisar el estado operativo del plugin.',

  // ── Sprint 15C.II Fase F.9 polish (review F1) — i18n del reconcile
  //    single-shot. R5 frozen (Toast UX 3 ramas) + R6 (coalesced prefix) +
  //    R7 (in-progress retry-after). Las keys con `{count}` se interpolan en
  //    runtime via `replace('{count}', ...)` — el `t()` actual no soporta
  //    ICU plural, decisión consciente para v1 (cuando llegue el sub-sprint
  //    EN se reemplaza por `next-intl` sin tocar call-sites).
  'service.reconcile.button.label': 'Reconciliar',
  'service.reconcile.button.loading': 'Reconciliando…',
  'service.reconcile.row_button.loading': '…',
  'service.reconcile.coalesced_prefix': 'Resultado en caché · ',
  'service.reconcile.toast.success_singular_with_timeline':
    'Reconciliación completada · 1 cambio aplicado. Ver detalle en timeline.',
  'service.reconcile.toast.success_plural_with_timeline':
    'Reconciliación completada · {count} cambios aplicados. Ver detalle en timeline.',
  'service.reconcile.toast.success_singular_no_timeline':
    'Reconciliación completada · 1 cambio aplicado.',
  'service.reconcile.toast.success_plural_no_timeline':
    'Reconciliación completada · {count} cambios aplicados.',
  'service.reconcile.toast.warning_singular_with_timeline':
    '1 drift detectado · no aplicado automáticamente (revisar timeline).',
  'service.reconcile.toast.warning_plural_with_timeline':
    '{count} drifts detectados · ninguno aplicado automáticamente (revisar timeline).',
  'service.reconcile.toast.warning_singular_no_timeline':
    '1 drift detectado · no aplicado automáticamente.',
  'service.reconcile.toast.warning_plural_no_timeline':
    '{count} drifts detectados · ninguno aplicado automáticamente.',
  'service.reconcile.toast.no_changes':
    'Sin cambios — el servicio está sincronizado con el proveedor.',
  'service.reconcile.toast.in_progress':
    'Reconciliación en curso. Inténtalo de nuevo en {seconds}s.',
  'plugin.overview.recent_drifts.action_column': 'Acción',

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

  // ── Sprint 15C.II Fase F.7 (ADR-077 Amendment A7 + ADR-083 A8) ─────────
  //    Card SSL `_shared/services/SslStatusCard.tsx`. Estados canónicos:
  //    valid (verde) / expiring_soon (ámbar) / expired (rojo) / none (gris).
  //    Cliente y admin renderizan el mismo card (L16, prop `isAdmin`);
  //    admin gana tooltip con fecha ISO + CTA al panel del proveedor.
  //    R3 (refinamiento pre-código): `none` muestra card visible — NO
  //    AlertBanner aparte (es estado del recurso, no aviso ortogonal).
  'service.ssl.card_title': 'Certificado SSL',
  'service.ssl.status_label': 'Estado',
  'service.ssl.issuer_label': 'Emisor',
  'service.ssl.renewal_label': 'Renovación automática',
  'service.ssl.status.valid': 'SSL activo',
  'service.ssl.status.expiring_soon': 'SSL caduca pronto',
  'service.ssl.status.expired': 'SSL caducado',
  'service.ssl.status.none': 'Sin certificado SSL',
  'service.ssl.message.valid_prefix': 'SSL activo — expira ',
  'service.ssl.message.expiring_soon_prefix':
    'Tu certificado SSL caduca pronto — expira ',
  'service.ssl.message.expired':
    'SSL caducado — el sitio aparecerá como "No seguro" en navegadores hasta que se renueve.',
  'service.ssl.message.none':
    'Sin certificado SSL — el sitio aparecerá como "No seguro" en navegadores.',
  'service.ssl.message.fallback_when': 'en breve',
  'service.ssl.auto_renew_on': 'Renovación automática activa.',
  'service.ssl.auto_renew_off':
    'Renovación manual — recuerda renovar antes del vencimiento.',
  'service.ssl.issuer_prefix': 'Emitido por ',
  'service.ssl.expires_tooltip_prefix': 'Expira: ',
  'service.ssl.admin_cta_manage_in_provider':
    'Gestionar SSL en el panel del proveedor →',

  // ── Sprint 15C.II Fase F.10 (ADR-077 Amendment A9 + ADR-083 A9) ─────────
  //    Card AppShortcuts `_shared/services/AppShortcutsCard.tsx`. Apps CMS
  //    instaladas (WordPress / Joomla + futuros). Capability-driven por
  //    presencia: el card se renderiza solo si info.apps && info.apps.length>0.
  //    R6 audit per-app via audit_access_log.metadata.app_id (cero schema
  //    change). Multi-instancia: 1 atajo por AppPresence con label
  //    diferenciado por path (ej. "(/blog)").
  'service.apps.card_title': 'Aplicaciones instaladas',
  'service.apps.open_app_admin.label_prefix': 'Abrir ',
  'service.apps.open_app_admin.title.sso':
    'Inicio de sesión automático en el admin de la app',
  'service.apps.open_app_admin.title.canonical':
    'Abre el admin de la app en una pestaña nueva (te pedirá tus credenciales)',
  'service.apps.disabled_no_default_user':
    'Configura un usuario por defecto en el panel para activar este atajo',
  'service.apps.disabled_no_default_user.cta_label': 'Abrir panel',
  'service.apps.path_prefix': 'Subdirectorio: ',
  'service.apps.version_prefix': 'Versión ',
  'service.apps.error_opening':
    'No se pudo abrir el admin de la aplicación. Intenta de nuevo o abre el panel del proveedor.',
  'service.apps.opening_tooltip': 'Abriendo en una pestaña nueva…',
  // Plugin Enhance — labels de los kinds soportados hoy.
  'plugin.enhance_cp.apps.wordpress': 'WordPress',
  'plugin.enhance_cp.apps.joomla': 'Joomla',
  'plugin.enhance_cp.apps.unknown': 'Aplicación',
  'plugin.enhance_cp.actions.open_app_admin.label': 'Abrir admin',
  'plugin.enhance_cp.actions.open_app_admin.description':
    'Abre el panel de administración de la aplicación en una pestaña nueva',

  // ── Sprint 15C.II Fase F.11.1 (R3 frozen §A.11.10.8.2) ─────────────────
  //    Mini-badge de salud del plugin in-process en `/admin/services/[id]`.
  //    Admin-only (R1 frozen — cliente NO ve este indicador técnico).
  'service.provider_health.label': 'Proveedor:',
  'service.provider_health.operational': 'operativo',
  'service.provider_health.degraded': 'degradado',
  'service.provider_health.down': 'caído',
  'service.provider_health.link_to_overview': 'Ver detalle del plugin',
  'service.provider_health.tooltip_in_process':
    'Estado del breaker en esta instancia del backend',
  'service.provider_health.tooltip_no_breakers':
    'Sin actividad reciente — las operaciones cross-cutting del plugin no se han invocado en esta instancia.',

  // ── Sprint 15C.II Fase F.11.2 (R2+R4+R5 frozen §A.11.10.8.2 + Amendment I) ──
  //    Card admin "Reenviar notificación al cliente" + modal con select de
  //    whitelist canónica de 3 plantillas de service-lifecycle.
  'service.notifications.resend.card_title': 'Reenviar notificación al cliente',
  'service.notifications.resend.card_description':
    'Envía de nuevo al cliente la última notificación de cambio de estado (suspensión, reactivación o cancelación). Re-renderizada con el estado actual del servicio.',
  'service.notifications.resend.card_button': 'Reenviar notificación…',
  'service.notifications.resend.modal_title': 'Reenviar notificación al cliente',
  'service.notifications.resend.modal_help_prefix':
    'Se enviará al cliente la plantilla seleccionada con el contexto actual del servicio ',
  'service.notifications.resend.modal_help_suffix':
    '. Útil cuando el cliente reporta no haber recibido el email original o necesita una copia.',
  'service.notifications.resend.template_field_label': 'Plantilla a reenviar *',
  'service.notifications.resend.template_field_help':
    'Solo se permiten plantillas de cambio de estado del servicio. El contenido se re-renderiza con los datos actuales.',
  'service.notifications.resend.template_label.suspended':
    'Servicio suspendido',
  'service.notifications.resend.template_label.unsuspended':
    'Servicio reactivado',
  'service.notifications.resend.template_label.cancelled':
    'Servicio cancelado',
  'service.notifications.resend.cancel': 'Cancelar',
  'service.notifications.resend.submit': 'Reenviar al cliente',
  'service.notifications.resend.submitting': 'Reenviando…',
  'service.notifications.resend.toast_success_prefix':
    'Notificación reenviada al cliente · plantilla: ',
  // Sprint 15C.II Fase F.11.2 Amendment II (P1 rate limiting frozen
  // 2026-05-19) — toast accionable cuando el backend devuelve
  // 429 RESEND_TOO_FREQUENT con retry_after_seconds.
  'service.notifications.resend.toast_rate_limited_prefix':
    'Esta misma plantilla se reenvió hace pocos segundos. Reintenta en ',
  'service.notifications.resend.toast_rate_limited_suffix': ' s.',

  // ── Sprint 15C.II Fase F.11.3 (R3-derivado §A.11.10.8.2 + L16) ──────────
  //    Card cross-link Service↔billing. Visible cliente y admin (L16 SÍ
  //    aplica: misma info, solo el href ramifica). Capability-driven por
  //    presencia: si no hay nextDueDate ni lastInvoice → no se renderiza.
  'service.billing_cross_link.card_title': 'Facturación',
  'service.billing_cross_link.next_renewal_prefix': 'Próxima renovación: ',
  'service.billing_cross_link.last_invoice_prefix': 'Última factura: ',
  'service.billing_cross_link.due_prefix': 'vence ',
  'service.billing_cross_link.view_invoice': 'Ver factura',
  'service.billing_cross_link.no_invoice_yet':
    'Sin facturas emitidas todavía para este servicio.',
  'service.billing_cross_link.invoice_status.draft': 'Borrador',
  'service.billing_cross_link.invoice_status.pending': 'Pendiente',
  'service.billing_cross_link.invoice_status.paid': 'Pagada',
  'service.billing_cross_link.invoice_status.overdue': 'Vencida',
  'service.billing_cross_link.invoice_status.cancelled': 'Cancelada',
  'service.billing_cross_link.invoice_status.refunded': 'Reembolsada',

  // ── Sprint 15C.II Fase F.12.5 (Amendment V — densidad profesional) ──────────
  //    Card "Recursos" (medidores <Meter>). Migra a i18n los copys que la
  //    MetricsBar tenía hardcodeados (regla D11 + §1.2 P5). Provisioner-agnóstico.
  'service.resources.card_title': 'Recursos',
  'service.resources.disk': 'Almacenamiento',
  'service.resources.bandwidth': 'Ancho de banda',
  'service.resources.ram': 'Memoria RAM',
  'service.resources.cpu': 'Uso de CPU',
  'service.resources.email': 'Cuentas de email',
  'service.resources.databases': 'Bases de datos',
  'service.resources.empty_admin':
    'Métricas no disponibles ahora — el proveedor no las devuelve. Pulsa «↻ Refrescar» para reintentar.',
  'service.resources.empty_client':
    'Métricas no disponibles ahora. Vuelve a esta página en unos minutos para ver datos actualizados.',
  'service.resources.updated_prefix': 'Actualizado ',
  'service.resources.updated_client_hint':
    '· Recarga la página para ver los datos más recientes.',
  'service.resources.fetched_tooltip_prefix': 'Última lectura del proveedor: ',
  'service.resources.relative.just_now': 'hace unos segundos',
  'service.resources.relative.ago': 'hace',
  'service.resources.relative.minute': 'minuto',
  'service.resources.relative.minutes': 'minutos',
  'service.resources.relative.hour': 'hora',
  'service.resources.relative.hours': 'horas',
  'service.resources.relative.day': 'día',
  'service.resources.relative.days': 'días',
  'service.resources.quota_advisory.at': 'Estás al',
  'service.resources.quota_advisory.warning':
    'de tu cuota de disco — considera liberar espacio o ampliar el plan.',
  'service.resources.quota_advisory.critical':
    'de tu cuota de disco — el servicio puede dejar de funcionar si llega al 100%. Considera liberar espacio o ampliar el plan urgentemente.',
  // Botones de métricas (admin) + sus ⓘ — F.12.5 punto 2.
  'service.resources.recalculate': 'Recalcular',
  'service.resources.recalculating': 'Recalculando…',
  'service.resources.recalculate_help':
    'Pide al proveedor que recompute disco y ancho de banda desde cero en su lado (puede tardar). Úsalo si las cifras parecen desactualizadas.',
  'service.resources.refresh_help':
    'Vuelve a leer del proveedor los últimos valores ya calculados (rápido). No fuerza un recálculo.',

  // ── F.12.5 — Card "¿Necesitas ayuda?" (aside, solo cliente) ──
  'service.help.card_title': '¿Necesitas ayuda?',
  'service.help.body':
    'Nuestro equipo de soporte puede ayudarte con cualquier duda o incidencia sobre este servicio.',
  'service.help.cta': 'Contactar con soporte',

  // ── F.12.5 (Amendment VII) — tabs Notas + Auditoría ──
  'service.detail.tab.notes': 'Notas',
  'service.detail.tab.audit': 'Auditoría',
  'service.audit.view_full': 'Ver historial completo',

  // ── F.12.5 (Amendment VII) — Card "Información del servicio" (servicios
  //    mínimos): da contenido al MAIN del overview cuando no hay métricas/SSL/
  //    apps. Narrativa por estado y por rol (cliente cálido / admin neutro). ──
  'service.overview.card_title': 'Información del servicio',
  'service.overview.plan': 'Plan',
  'service.overview.contracted': 'Contratado',
  'service.overview.renewal': 'Renovación',
  'service.overview.cancelled': 'Cancelado',
  'service.overview.narrative.client.active':
    'Tu servicio está activo y funcionando correctamente.',
  'service.overview.narrative.client.pending':
    'Tu servicio se está activando. Estará listo en breve.',
  'service.overview.narrative.client.suspended':
    'Tu servicio está suspendido temporalmente.',
  'service.overview.narrative.client.expired': 'Tu servicio ha expirado.',
  'service.overview.narrative.client.failed':
    'Ha habido un problema con tu servicio. Nuestro equipo está al tanto.',
  'service.overview.narrative.client.cancelled': 'Este servicio está cancelado.',
  'service.overview.narrative.client.unknown':
    'Estamos comprobando el estado de tu servicio.',
  'service.overview.narrative.admin.active': 'El servicio está activo y operativo.',
  'service.overview.narrative.admin.pending':
    'El servicio se está aprovisionando.',
  'service.overview.narrative.admin.suspended': 'El servicio está suspendido.',
  'service.overview.narrative.admin.expired': 'El servicio ha expirado.',
  'service.overview.narrative.admin.failed':
    'El servicio reportó un fallo en el proveedor.',
  'service.overview.narrative.admin.cancelled': 'El servicio está cancelado.',
  'service.overview.narrative.admin.unknown':
    'Estado del servicio sin confirmar por el proveedor.',

  // ════════════════════════════════════════════════════════════════════════
  // Plugin ResellerClub (registrar de dominios) — Sprint 15D Fase 15D.G.
  // Bloque que faltaba: el plugin emite estas keys (manifest/config/secrets/
  // actions/status_reason) y, sin traducir, se mostraban crudas en
  // /admin/plugins + el form de producto (mismo patrón que enhance_cp arriba —
  // ver cabecera, "futuros plugins SaaS añadirán su bloque plugin.<slug>.*").
  // ════════════════════════════════════════════════════════════════════════

  // ── Manifest (ADR-080 §1 + ADR-081 §2)
  'plugin.resellerclub.label': 'Dominios ResellerClub',
  'plugin.resellerclub.description':
    'Plugin de registrar de dominios vía ResellerClub (API LogicBoxes). Registra, renueva y gestiona dominios (nameservers, privacidad WHOIS, bloqueo de transferencia, auth-code). No es autoridad DNS —esa es el plugin de hosting— y nunca expone el panel de ResellerClub al cliente (puerta unificada).',

  // ── Config (ADR-084 §3.4)
  'plugin.resellerclub.config.environment.label': 'Entorno de la API',
  'plugin.resellerclub.config.environment':
    'sandbox usa OT&E (test.httpapi.com) para pruebas sin coste real; production usa httpapi.com (registros reales que cuestan dinero). La IP del servidor debe estar whitelisteada en el panel de ResellerClub.',
  'plugin.resellerclub.config.markup_percent.label': 'Margen sobre el coste (%)',
  'plugin.resellerclub.config.markup_percent':
    'Porcentaje que se añade al coste mayorista de cada TLD para calcular el precio de venta. Lo aplica el cron diario que rellena la tabla de precios por extensión. Default 25.',
  'plugin.resellerclub.config.tlds_offered.label': 'TLDs ofertados',
  'plugin.resellerclub.config.tlds_offered':
    'Extensiones que se ofrecen al cliente, separadas por comas (ej. .com,.net,.org,.es,.eu). El cron de precios solo sincroniza estos TLDs.',
  'plugin.resellerclub.config.default_currency.label': 'Moneda',
  'plugin.resellerclub.config.default_currency':
    'Moneda única de coste y venta (ISO 4217, 3 letras). El cron descarta cualquier TLD cuyo coste llegue en otra moneda para no tarifar mal. Default EUR.',

  // ── Secrets (cifrados AES-256-GCM, ADR-080 §3)
  'plugin.resellerclub.secrets.authUserId.label': 'Reseller ID (auth-userid)',
  'plugin.resellerclub.secrets.authUserId':
    'Identificador de revendedor de tu cuenta ResellerClub. Se cifra con AES-256-GCM antes de persistirse.',
  'plugin.resellerclub.secrets.apiKey.label': 'API key',
  'plugin.resellerclub.secrets.apiKey':
    'Clave de API de ResellerClub (Settings → API). Principio de mínimo privilegio frente a la contraseña. Se cifra con AES-256-GCM antes de persistirse.',

  // ── Acciones curadas (ADR-077 A10 + ADR-081 A5)
  'plugin.resellerclub.actions.modify_nameservers': 'Cambiar nameservers',
  'plugin.resellerclub.actions.modify_nameservers.description':
    'Modifica la delegación de nameservers del dominio en el registrar (no la zona DNS, que gestiona el hosting). Verifica el cambio releyendo el registrar.',
  'plugin.resellerclub.actions.modify_nameservers.confirm':
    'Cambiar los nameservers puede dejar el dominio sin resolver si son incorrectos. ¿Confirmar?',
  'plugin.resellerclub.actions.modify_nameservers.field.nameservers':
    'Nameservers (mínimo 2)',
  'plugin.resellerclub.actions.modify_nameservers.success':
    'Nameservers actualizados en el registrar.',
  'plugin.resellerclub.actions.modify_contacts': 'Editar contactos',
  'plugin.resellerclub.actions.toggle_privacy': 'Privacidad WHOIS',
  'plugin.resellerclub.actions.toggle_privacy.field.enabled':
    'Activar privacidad WHOIS',
  'plugin.resellerclub.actions.toggle_privacy.field.reason': 'Motivo (opcional)',
  'plugin.resellerclub.actions.toggle_privacy.enabled':
    'Privacidad WHOIS activada.',
  'plugin.resellerclub.actions.toggle_privacy.disabled':
    'Privacidad WHOIS desactivada.',
  'plugin.resellerclub.actions.toggle_registrar_lock':
    'Bloqueo de transferencia',
  'plugin.resellerclub.actions.toggle_registrar_lock.field.locked':
    'Bloquear transferencias (registrar lock)',
  'plugin.resellerclub.actions.toggle_registrar_lock.enabled':
    'Bloqueo de transferencia activado.',
  'plugin.resellerclub.actions.toggle_registrar_lock.disabled':
    'Bloqueo de transferencia desactivado.',
  'plugin.resellerclub.actions.get_auth_code':
    'Obtener código de autorización (EPP)',
  'plugin.resellerclub.actions.get_auth_code.description':
    'Devuelve el código de autorización (EPP/auth-code) para transferir el dominio a otro registrador. Requiere el dominio activo y sin bloqueo de transferencia.',
  'plugin.resellerclub.actions.get_auth_code.success':
    'Código de autorización obtenido.',
  'plugin.resellerclub.actions.suspend_service': 'Suspender dominio',
  'plugin.resellerclub.actions.suspend_service.description':
    'Suspende el dominio en el registrar (uso administrativo: impago o fraude). El dominio deja de resolver hasta reactivarlo.',
  'plugin.resellerclub.actions.suspend_service.confirm':
    'El dominio se suspenderá en el registrar y dejará de resolver. ¿Confirmar?',
  'plugin.resellerclub.actions.suspend_service.success':
    'Dominio suspendido en el registrar.',
  'plugin.resellerclub.actions.unsuspend_service': 'Reactivar dominio',
  'plugin.resellerclub.actions.unsuspend_service.description':
    'Reactiva un dominio previamente suspendido en el registrar.',
  'plugin.resellerclub.actions.unsuspend_service.confirm':
    'El dominio se reactivará en el registrar. ¿Confirmar?',
  'plugin.resellerclub.actions.unsuspend_service.success':
    'Dominio reactivado en el registrar.',

  // ── Estados (mapeo domains/details, ADR-081 §6)
  'plugin.resellerclub.status_reason.not_yet_provisioned':
    'El dominio aún no se ha registrado.',
  'plugin.resellerclub.status_reason.provider_unreachable':
    'No se pudo contactar con el registrar. Se reintentará en la próxima reconciliación.',
  'plugin.resellerclub.status_reason.pending_delete':
    'El dominio está en periodo de borrado (pending delete). Contacta con soporte.',
  'plugin.resellerclub.status_reason.redemption':
    'El dominio expiró y está en periodo de redención. Recuperarlo requiere una tarifa especial — contacta con soporte.',
  'plugin.resellerclub.status_reason.expired': 'El dominio ha expirado.',
  'plugin.resellerclub.status_reason.suspended':
    'El dominio está suspendido en el registrar.',
  'plugin.resellerclub.status_reason.pending_verification':
    'El dominio está pendiente de verificación (p. ej. validación del email del titular).',
  'plugin.resellerclub.status_reason.inconsistent':
    'El estado del dominio en el registrar es inconsistente. Se revisará en la próxima reconciliación.',
});

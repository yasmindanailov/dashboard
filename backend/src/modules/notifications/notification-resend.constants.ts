/**
 * Sprint 15C.II Fase F.11.2 (R4 frozen §A.11.10.8.2 + Amendment I).
 *
 * Whitelist canónica de plantillas reenviables por admin desde
 * `/admin/services/[id]`. **Defense-in-depth (R4 frozen)**: el frontend
 * refleja esta lista en el modal `<ResendNotificationModal>`, pero el
 * enforcement real vive aquí — el DTO `ResendNotificationDto` aplica
 * `@IsIn(NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE)` y el
 * service rechaza `INVALID_TEMPLATE_KEY` cualquier valor fuera de la
 * lista (curl con `template_key='task.assigned'` → 400 garantizado).
 *
 * **Amendment I durante implementación F.11.2** (L18 frozen — mejora
 * descubierta = Amendment, no desvío silencioso): la whitelist V1
 * canónica frozen incluye 3 plantillas (vs las 5 del §A.11.10.8.2 R4
 * original). Razones rigurosas:
 *
 *   - **`service.password_reset` EXCLUIDA** — esta plantilla cabalga
 *     sobre un flow propio con generación de OTP fresh (Sprint 15C.II
 *     Fase D). El admin que quiera "ayudar al cliente que perdió el
 *     email original" debe disparar la action `reset_account_password`
 *     sobre el servicio (que ya regenera OTP fresh end-to-end). Re-
 *     enviar la plantilla con OTP histórico expirado degradaría UX
 *     ("código no válido"). Coherente con doctrina F.4 A1.
 *
 *   - **`service.quota_threshold_crossed` EXCLUIDA** — el payload
 *     canónico requiere snapshot in-flight de `used_pct` / `used_mb` /
 *     `total_mb` del proveedor que NO deriva del Service entity (vive
 *     en la lectura `getServiceInfo.metrics` o en la última fila
 *     `ServiceQuotaAlert`, ambas con TTL distintos a la notificación
 *     original). Reenviar con datos desactualizados ("87% lleno" cuando
 *     ahora está al 92%) confundiría al cliente. Apuntado como sub-
 *     feature futura: si demanda admin lo justifica, reusar el último
 *     `ServiceQuotaAlert(kind='crossed_up')` como snapshot persistido
 *     + dispatcher per template — sin tocar el contrato whitelist.
 *
 * Whitelist V1 frozen = transiciones puras del lifecycle administrativo
 * cuyo payload se deriva trivialmente del `Service` actual (R2 frozen:
 * fresh re-render). Heredable a 15D RC / 15E Docker / 15G Plesk.
 */

export const NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE = [
  'service.suspended',
  'service.unsuspended',
  'service.cancelled',
] as const;

export type ServiceLifecycleTemplateKey =
  (typeof NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE)[number];

export function isServiceLifecycleTemplateKey(
  key: string,
): key is ServiceLifecycleTemplateKey {
  return (
    NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE as readonly string[]
  ).includes(key);
}

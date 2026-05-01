# Support Inside — Guía del cliente

> Última actualización: 2026-05-01 (Sprint 8 cierre)
> Audiencia: cliente final de Aelium.
> Para la vista admin del módulo, ver [`admin.md`](./admin.md).

---

## 1. ¿Qué es Support Inside?

Support Inside es nuestro **plan de cuidado y soporte premium**. Te da:

- **Mantenimiento mensual** de tus servicios técnicos (hosting, Docker, etc.) — sin que tengas que pedirlo cada vez.
- **Respuesta más rápida** en tickets y chats — el SLA depende del plan que elijas.
- **Canales adicionales** (email + panel + WhatsApp en planes superiores).
- **Prioridad automática** en cualquier ticket que abras.

No es un producto técnico que se ejecuta en un servidor — es un **tier de cuenta**. Cuando lo activas, todo lo que ya contratabas con Aelium pasa a tener un cuidado distinto.

---

## 2. Los 3 planes

| Plan | Slots de mantenimiento | SLA respuesta | Canales | Mensual | Anual (ahorras 15%) |
|------|------------------------|---------------|---------|---------|---------------------|
| **Básico** | 1 servicio cubierto | 24h | Email + Panel | 19 € | 193,80 € |
| **Medium** | 3 servicios cubiertos | 12h | Email + Panel | 49 € | 499,80 € |
| **Pro** | 10 servicios cubiertos | 4h | Email + Panel + WhatsApp* | 99 € | 1.009,80 € |

*WhatsApp llegará en una próxima actualización; el plan Pro lo incluye sin coste adicional cuando esté disponible.

> **¿Por qué la versión anual es más barata?** Porque al pagar el año por adelantado nos ayudas con la planificación. Te devolvemos parte de ese valor con un 15% de descuento.

---

## 3. Cómo se contrata

1. Ve a **`/dashboard/support-inside`** desde tu panel.
2. Verás los 3 planes lado a lado. Cada card muestra qué incluye y un toggle "Mensual / Anual".
3. Click en "Suscribirme" del plan que prefieras.
4. El sistema te lleva al **checkout estándar de Aelium** (la misma página que usas para contratar hosting o cualquier otro servicio).
5. Confirmas tu perfil de facturación y procedes al pago.
6. Una vez pagada la factura, tu plan Support Inside queda **activo automáticamente**.

> **Lo importante:** Support Inside usa exactamente el mismo flujo de pago que cualquier otro servicio. Si tienes varios perfiles de facturación (autónomo + sociedad, por ejemplo), puedes elegir cuál facturar en el checkout.

---

## 4. ¿Qué es un "slot"?

Un **slot** es la cobertura de mantenimiento mensual sobre uno de tus servicios técnicos.

- **Plan Básico** → 1 slot. Eliges qué servicio quieres que cuidemos cada mes.
- **Plan Medium** → 3 slots. Hasta 3 servicios cubiertos simultáneamente.
- **Plan Pro** → 10 slots.

### Asignar un slot a un servicio

1. Ve a `/dashboard/support-inside` (vista de gestión, una vez tengas plan activo).
2. Click en "Asignar slot".
3. El modal te muestra **sólo los servicios elegibles** — los compatibles con tu plan (hosting web, contenedores Docker, etc.). Si tienes un dominio o un add-on, no aparecerán: el mantenimiento técnico no aplica a ellos.
4. Selecciona el servicio y confirma.

A partir de ese momento, cada mes (en el día aniversario de la asignación) nuestro equipo realizará una rutina de mantenimiento sobre ese servicio. Recibirás un **resumen por email** cuando lo completen, con qué se hizo y cualquier observación relevante.

### Liberar un slot

Si ya no quieres cubrir ese servicio o quieres mover el slot a otro:

1. En la vista de gestión, en el slot asignado → "Liberar slot".
2. El servicio queda sin cobertura, pero **el servicio en sí sigue funcionando exactamente igual** — sólo deja de estar en el calendario de mantenimiento.

### ¿Qué pasa si tengo más servicios que slots?

Eliges los más críticos. Cuando termines de usar uno, libéralo y asigna el slot a otro. Si quieres cubrir más, sube de plan (próximamente — hoy hay que cancelar y recontratar).

---

## 5. Tu SLA y tus canales

El SLA es el **tiempo máximo de primera respuesta** en tus tickets y chats:

- **Básico (24h)**: respondemos en menos de 24h hábiles.
- **Medium (12h)**: en menos de 12h hábiles.
- **Pro (4h)**: en menos de 4h hábiles.

Cuando abras un ticket o chat con Support Inside activo:

- Tu conversación queda automáticamente con prioridad alta o urgente (según el plan).
- El equipo ve un badge en su panel ("Medium · SLA 12h") para entender el contexto sin pedírtelo.
- Si tu plan incluye WhatsApp, podrás contactar también por ese canal (próximamente).

---

## 6. Tu plan en el dashboard

En tu **`/dashboard`** (overview) verás una card **"Mi plan Support Inside"** con:

- Plan actual (Básico / Medium / Pro).
- Cuántos slots usas vs cuántos incluye tu plan ("1 / 3 slots usados").
- Link directo a la página de gestión.

Si no tienes plan, verás una card alternativa con CTA "Activa Support Inside".

---

## 7. Renovación y facturación

- **Renovación automática**: tu plan se renueva al final del ciclo (mensual o anual). Recibirás aviso por email antes de la renovación.
- **Cambiar de ciclo**: hoy se hace cancelando y recontratando con el ciclo nuevo. (Cambio prorrateado real llegará en una próxima actualización.)
- **Cambiar de plan** (ej. Básico → Medium): mismo procedimiento — cancela y recontrata. Los slots actuales se liberan y deberás asignarlos de nuevo en el plan nuevo.

---

## 8. Cancelar tu plan

1. `/dashboard/support-inside` → vista de gestión → botón "Cancelar plan".
2. Modal de confirmación con resumen del impacto: "Liberarás N slots; tus servicios técnicos seguirán funcionando con normalidad".
3. Confirmar.

Tras cancelar:

- Tus servicios técnicos siguen activos. **Cancelar Support Inside NO cancela tu hosting ni nada similar.** Sólo desactiva la cobertura premium.
- Las facturas pendientes de cobro siguen su curso normal.
- Puedes recontratar en cualquier momento desde el comparador.

---

## 9. Preguntas frecuentes

**¿Tengo que tener Support Inside para tener hosting?**
No. Hosting y Support Inside son independientes. Support Inside es una capa premium añadida a lo que ya tengas.

**¿El mantenimiento incluye qué exactamente?**
Depende del tipo de servicio. En hosting web suele incluir: revisión de logs, actualizaciones menores de WordPress/CMS si aplica, comprobación de copias de seguridad, monitor de espacio y rendimiento, ajustes de configuración recomendados. Tu agente te detallará en el resumen mensual qué se hizo en concreto.

**Si tengo Plan Medium con 3 slots y sólo asigno 1 ¿pago igual?**
Sí — pagas por la **capacidad** + SLA + canales del plan, no por slot consumido. Los slots no asignados están a tu disposición.

**¿Y si abro un ticket que no es de un servicio cubierto por slot?**
Se atiende igualmente con tu SLA y canales del plan. El "slot" es solo para mantenimiento programado mensual; tu prioridad y tiempos de respuesta aplican a **todo** lo que abras con nosotros.

**¿Cuándo se cobra la primera factura?**
Al hacer click "Suscribirme" se genera una factura con estado pendiente. Una vez pagada (manualmente o vía pasarela cuando esté disponible), el plan se activa.

**¿Hay periodo de prueba gratuito?**
No. Pero puedes contratar el plan mensual y cancelarlo en cualquier momento sin penalización (no se prorratea — pagas el mes completo).

---

## 10. Smoke testing (para la usuaria seedeada Carla)

Si estás haciendo pruebas sobre la cuenta `cliente@aelium.test` (Carla, seedeada en `pnpm seed`):

1. Login Carla → `/dashboard` → debería verse card "Mi plan Support Inside" con plan **Medium** activo + "1 / 3 slots usados".
2. Click "Ver mi plan" → `/dashboard/support-inside` → vista gestión con 1 slot asignado al servicio "Web demo Carla".
3. Click "Asignar slot" → modal con select de servicios elegibles (sólo los de tipos compatibles con Medium, que es `['hosting_web', 'docker_service']` por defecto).
4. **Cancelar plan** desde la vista de gestión → modal de confirmación → confirma → status pasa a `cancelled` y los slots se liberan en cascada.
5. **Recontratar** desde el comparador (3 cards) → click "Suscribirme Pro" → redirige a `/dashboard/billing/checkout?product_pricing_id=...` → confirmar → factura pendiente + plan Pro activo.

---

## 11. Si algo no funciona

| Síntoma | Causa probable | Qué hacer |
|---------|----------------|-----------|
| El comparador muestra 0 planes | Los planes no están seedeados | Ejecutar `pnpm seed` desde el backend (estamos en entorno dev). En producción nunca pasaría — los 3 planes son canónicos. |
| Al asignar slot no aparece mi servicio en la lista | Tu plan no permite ese tipo de servicio o el servicio no está `active` | Mira los tipos cubiertos por tu plan en la vista de gestión. Si tu servicio sí debería ser elegible y no lo es, abre un ticket. |
| He pagado pero el plan no se activa | El listener `service.provisioned` no procesó el evento | Contacta soporte. El equipo verifica el DLQ y reactiva manualmente. |
| Quiero subir de Básico a Pro sin cancelar | Hoy no se puede prorratear el cambio | Cancela y recontrata. (Próximamente: cambio prorrateado real.) |

---

## 12. Referencias

- [`admin.md`](./admin.md) — Vista del equipo Aelium (configuración + operativa interna)
- Política de soporte — `legal/sla.md` (cuando se publique)

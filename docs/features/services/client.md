# Mis servicios — Guía del cliente

> Última actualización: 2026-05-02 (Sprint 11 Fase 11.E cierre)
> Audiencia: cliente final de Aelium.
> Para la vista interna (admin / agente), ver [`admin.md`](./admin.md) y [`docs/features/provisioning/admin.md`](../provisioning/admin.md).

---

## 1. ¿Qué encuentro en "Mis servicios"?

En **`/dashboard/services`** verás todo lo que tienes contratado con Aelium en una sola lista: hostings, dominios, contenedores Docker, planes Support Inside, add-ons. Cada fila es un servicio activo (o pendiente de activación) con su nombre, tipo de producto y estado actual.

Click en cualquier fila → te lleva a la **página de detalle del servicio** (`/dashboard/services/<id>`), donde está toda la información operativa de ese servicio: estado real, vencimiento, métricas si las hay, y las acciones que puedes ejecutar tú mismo desde el dashboard.

> **Doctrina canónica:** una sola página unificada para TODOS tus servicios, sea hosting, dominio o Docker. Lo que cambia es lo que el plugin del producto te muestra (métricas, panel SSO, acciones). Aelium no replica el panel del proveedor — te da un acceso curado y delega al panel especialista cuando aplica.

---

## 2. Estados de un servicio

| Estado | Qué significa |
|--------|---------------|
| **Pendiente** | El pago se ha registrado y estamos preparando tu servicio. Si el plugin requiere intervención manual del agente, verás "Pendiente de configuración por el equipo". |
| **En provisioning** | El sistema está creando el recurso en el proveedor (cPanel, ResellerClub, Docker, etc.). Suele durar segundos; si tarda más, te avisamos. |
| **Activo** | Servicio funcionando. Aquí ves toda la información operativa. |
| **Suspendido** | Servicio temporalmente cortado (impago, decisión admin, mantenimiento crítico). Para reactivarlo, salda la factura pendiente o contacta soporte. |
| **Caducado** | Vencimiento alcanzado sin renovación. El servicio sigue accesible un periodo de gracia antes de cancelarse. |
| **Cancelado** | Servicio terminado. Los datos siguen disponibles según la política de retención de cada producto. |
| **Fallido** | El provisioning automático no pudo completarse. El equipo de Aelium ya está sobre aviso — recibirás un email cuando se resuelva. |

---

## 3. La página de detalle (`/dashboard/services/<id>`)

Una sola plantilla para todos los servicios. Lo que veas depende del plugin que provisione tu producto:

### 3.1 Cabecera

- **Nombre principal**: dominio, identificador de cuenta o etiqueta del servicio (ej: `miweb.com`, `cliente1.aelium.net`).
- **Subtítulo opcional**: producto contratado (ej: "Hosting Pro 10GB").
- **Estado** con badge de color: el estado **real consultado al proveedor** (no la última lectura de Aelium — el plugin lo refresca con cada visita, cacheado 60 segundos).
- **Vencimiento** + auto-renovación si aplica.

### 3.2 Métricas

Solo si tu plugin las expone. Verás barras visuales de:

- Disco usado / total.
- Ancho de banda usado / total del mes.
- RAM y CPU (sólo Docker).
- Cuentas de email, bases de datos, etc.

> **¿No ves métricas?** Significa que tu producto no las expone (caso típico de dominios o Support Inside) o que el proveedor está temporalmente caído. Volverá automáticamente cuando se restablezca.

### 3.3 Botón "Abrir panel" (SSO)

Si tu producto tiene panel especialista (cPanel, Plesk, Enhance, Collabora admin, etc.), verás un botón que te lleva al panel del proveedor **ya logueado**, sin pedirte usuario y contraseña. Se abre en una pestaña nueva para no perder el dashboard de Aelium.

> **¿No ves el botón?** Tu producto no tiene panel externo (ej: dominios ResellerClub, planes Support Inside, configuración manual). Las gestiones se hacen desde Aelium directamente o por ticket.

### 3.4 Acciones inline

Las acciones que puedes ejecutar tú mismo. Lista corta y curada — no replicamos todo lo que ofrece el panel del proveedor, sólo lo que tiene sentido hacer desde Aelium:

- **Hosting (cPanel/Plesk/Enhance)**: ver disco, ver bandwidth, reset password de la cuenta.
- **Dominios (ResellerClub)**: ver/crear/editar/borrar registros DNS, solicitar transfer-out, activar/desactivar auto-renovación.
- **Docker**: reiniciar contenedor, ver logs (últimas 100 líneas), reset de contraseña admin, cambiar subdominio, solicitar upgrade de recursos.
- **Support Inside / productos manuales**: sin acciones inline (el equipo Aelium es quien actúa por ti).

Cada acción te pide confirmación si es destructiva. **Todas las acciones quedan registradas** y son consultables en tu portal de transparencia (`/dashboard/transparency`).

---

## 4. Cómo se activa un servicio

1. Eliges el producto en `/dashboard/billing/checkout` o `/dashboard/support-inside`.
2. Pagas la factura.
3. Cuando el pago se confirma:
   - **Productos automáticos** (`internal`, hosting con plugin, Docker, dominios): el sistema crea el recurso al instante. En cuestión de segundos lo verás `Activo` en `/dashboard/services`.
   - **Productos manuales**: el sistema crea una tarea interna para el equipo Aelium. Cuando un agente la complete (típicamente el mismo día laborable), el servicio pasa a `Activo` y recibes email + notificación en la campana.

> **No tienes que hacer nada** entre el pago y la activación. Si pasan más horas de lo razonable, contacta soporte mencionando el número de factura.

---

## 5. ¿Qué pasa si el provisioning automático falla?

Si el proveedor (cPanel, ResellerClub, Docker, etc.) no responde o devuelve un error:

- El sistema **reintenta automáticamente** con espera creciente (30 segundos, luego 90, luego 270).
- Si tras varios intentos sigue fallando, el equipo Aelium recibe una alerta y se hace cargo manualmente.
- Tú recibirás un email explicando qué ha pasado y cuándo estará resuelto.

**Tu factura sigue siendo válida** y el servicio terminará activo — el reintento o intervención manual son transparentes para ti.

---

## 6. Vista admin del agente

Si eres staff, esta página te muestra **sólo tus propios servicios**. Para ver los de cualquier cliente, usa la vista admin: `/admin/services` (filtros por cliente, plugin, estado) o entra a la ficha de un cliente concreto en `/admin/clients/<id>` (bloque "Servicios contratados" — pendiente Sprint posterior, ver DC.29 en `backlog.md`).

---

## 7. Política de privacidad y auditoría

Cada vez que el dashboard consulta el proveedor para enseñarte tus métricas, abre tu panel SSO o ejecuta una acción inline, queda **registrado en tu portal de transparencia** ([`/dashboard/transparency`](../../../frontend/app/dashboard/transparency/page.tsx)). Aelium nunca consulta ni actúa sobre tu servicio sin que tú o un agente lo dispare conscientemente.

> Cumple [ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md) §"Auditoría" + RGPD: tienes derecho a saber cuándo Aelium habla con el proveedor en tu nombre.

---

## 8. Preguntas frecuentes

**¿Por qué no veo el botón "Abrir panel" en mi servicio?**
Tu producto no tiene panel externo (caso típico: dominios, Support Inside, productos puramente Aelium-side).

**¿Por qué no veo métricas?**
Tu producto no las expone (dominios, planes Support Inside) o el proveedor está temporalmente caído.

**¿Puedo borrar un servicio desde aquí?**
No. La cancelación pasa siempre por `/dashboard/billing` (cancelar suscripción) o por contactar soporte. Las acciones inline son operativas, no destructivas a nivel de servicio entero.

**¿Se actualizan los datos en tiempo real?**
El detalle se cachea **60 segundos** para no martillar al proveedor. Si acabas de ejecutar una acción, el cache se invalida automáticamente y la próxima carga muestra el estado actualizado.

**¿Qué pasa si el proveedor está caído?**
La página sigue funcionando — verás un mensaje "Estado no disponible temporalmente" y volverá a cargar bien cuando el proveedor responda. Tu servicio en sí no está afectado.

---

## Referencias canónicas

- [ADR-021](../../10-decisions/adr-021-provisioners.md) — interfaz mínima de plugins.
- [ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md) — service info + SSO + acciones curadas.
- [ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) — contrato canónico `ProvisionerPlugin` v2.
- [`docs/20-modules/provisioning/contract.md`](../../20-modules/provisioning/contract.md) — módulo completo.

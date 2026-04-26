# ADR-034 — Support Inside (modelo de soporte gestionado con slots)

> **Status:** Active (refinado por ADR-061 — UX dedicada, schema sin cambios)
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR + refinamiento UX vía ADR-061)
> **Original:** DECISIONS.md §7
> **Domain:** support, products

---

## Contexto

Aelium ofrece dos niveles de relación con el cliente:

1. **Cliente "estándar":** Aelium provee la infraestructura (hosting, dominio, Docker). El soporte es **al hosting/servidor**, no a lo que el cliente monta encima. Si su WordPress se rompe, no entramos a arreglarlo.

2. **Cliente con Support Inside:** Aelium **entra dentro del producto del cliente** (web, contenedor) para hacer tareas técnicas, mantenimiento, gestión proactiva. Es un addon de cuenta global, no de un producto concreto.

La pregunta de diseño: **¿cómo se modela Support Inside para que sea coherente con el catálogo dinámico (ADR-018) sin volverse caso especial?**

---

## Decisión

### Naturaleza de Support Inside

**Producto del catálogo de tipo `support_inside`** con configuración específica (ADR-019). Características:

- **Addon global de cuenta del cliente.** No vinculado a un producto concreto, sino a la cuenta entera.
- **Requiere al menos un producto activo** para poder contratarlo. No tiene sentido sin algo que soportar.
- **El plan define el nivel de soporte reactivo y los canales disponibles.**
- **Los slots de mantenimiento son INDEPENDIENTES del plan** y se contratan aparte (productos `support_addon`).

### Tres niveles base (nombres definitivos: configurables al lanzar)

| Plan | Soporte reactivo | Canales | Slots incluidos |
|------|------------------|---------|-----------------|
| **Básico** | Agente real de primeras en webchat. Acceso al producto para tareas básicas (DNS, instalar WordPress, plugins recomendados, configs). | Webchat · conversación asíncrona · email · teléfono. | 0 (puede comprar slots adicionales) |
| **Medium** | Todo Básico + mantenimiento proactivo mensual incluido. | Todo lo anterior **+ WhatsApp**. | 1 slot mantenimiento gratis. Puede comprar adicionales. |
| **Pro** | Todo Medium + soporte proactivo avanzado (Cloudflare si crece tráfico, CDN, optimizaciones, revisión métricas). | Todos + **WhatsApp con máxima prioridad**. | 1 slot mantenimiento + gestión proactiva gratis. Puede comprar adicionales (mantenimiento o mantenimiento+gestión). |

### Sistema de slots

**Slot Mantenimiento**
- Disponible para los 3 planes (Básico, Medium, Pro).
- Cubre: actualizaciones, revisión backups, SSL, etc., según `product_checklist_items` del producto al que se asigna el slot.
- Precio: X €/slot (definido al crear el producto `support_addon`).

**Slot Mantenimiento + Gestión Proactiva**
- Disponible **solo para Plan Pro**.
- Cubre: todo lo del mantenimiento + gestión activa del servicio.
- **Siempre van juntos en el mismo slot — no son separables.**
- Orientado a negocios complejos que necesitan a alguien encima.
- Precio: Y €/slot (Y > X).

### Reglas de los slots

1. **Un slot = un servicio del cliente.** El cliente selecciona a qué servicio asigna cada slot desde su página de Support Inside.
2. **Si no tiene servicios al contratar Support Inside** → se le pide seleccionar o crear uno.
3. **El servicio con slot activo es visible para cliente y admin** (badge "Mantenido").
4. **El cliente con Support Inside activo** tiene badge visible en su ficha y en su cuenta.
5. **Si se cancela Support Inside → se cancelan todos los slots automáticamente.**
6. **Un slot se puede cancelar individualmente** sin cancelar Support Inside.

### Recurrencia del mantenimiento

- La tarea de mantenimiento se genera **el día del mes equivalente al de contratación del slot**. Ej: contratado el día 15 → mantenimiento el día 15 de cada mes.
- Esto **distribuye la carga de trabajo del equipo** a lo largo del mes (en lugar de todos los mantenimientos el día 1).
- El mantenimiento corresponde al mes en curso. **No se arrastra al siguiente.**
- Si la tarea no se completa en su mes → alerta al admin (estado: crítico).
- Alerta de tarea crítica: X días antes de fin de mes si sigue pendiente. X configurable en settings.

### Página de Support Inside del cliente

El cliente tiene una zona específica con:

- Su **plan actual** y canales disponibles.
- **Sus servicios con slot activo:** estado · última revisión · próxima revisión.
- Botón para **añadir más slots o mejorar el plan**.
- **Historial de valor:** consultas resueltas · tiempo medio de respuesta · soluciones aplicadas · mantenimientos realizados con detalle.
- **Medios de contacto disponibles** según su plan.

### Support Inside para agencias

- Mismo modelo que B2C.
- Los slots aplican a las webs de los **clientes finales de la agencia**.
- Soporte siempre **a la agencia**, nunca contacto directo con el cliente final.

### IA copilot del agente (Support Inside)

> **Detalle completo en ADR-057.**

Resumen aquí: la IA NO es para el cliente. Es **copilot interno para el agente humano**. Sugiere respuestas en la voz de Aelium con contexto del cliente. El agente puede usar / editar / ignorar. **El cliente nunca sabe que hay IA detrás** — solo ve respuestas humanas, rápidas, contextualizadas.

### Pendiente — decisiones de producto a cerrar al lanzar

- **Nombres definitivos** de los planes (decisión de marketing).
- **SLA exactos** de cada plan (se definen con primeros 2-3 clientes reales).

---

## Consecuencias

- ✅ **Ganamos:**
  - Modelo coherente con catálogo dinámico (Support Inside es producto, no caso especial).
  - Slots distribuyen carga del equipo a lo largo del mes.
  - Diferenciación clara entre soporte estándar (incluido) y Support Inside (premium).
  - IA copilot escala al equipo sin cambiar UX para el cliente.
- ⚠️ **Aceptamos:**
  - Lógica de slots requiere construcción significativa (asignación slot↔servicio, generación de tareas mensuales, alertas de crítico).
  - **Estado actual:** modelo definido, schema parcialmente implementado. Lógica de slots y mantenimientos automáticos pendientes de sprint dedicado.
  - Pricing exacto y nombres de planes pendientes de cerrar antes de lanzamiento.
- 🚪 **Cierra:**
  - **Soporte estándar NO entra dentro del producto del cliente.** Solo Support Inside.
  - **No mezclar planes con slots.** Plan = nivel de soporte reactivo. Slots = mantenimiento proactivo. Compra independiente.

---

## Cuándo revisar

- Tras los primeros 5-10 clientes reales con Support Inside: ajustar SLAs, nombres de planes, precios.
- Si surge demanda de "Support Inside Plus" con más canales (Slack, Discord) → ampliar canales en config del producto.
- Si los slots de mantenimiento se vuelven el bottleneck del equipo → revisar capacidad o subir precios.

---

## Referencias

- **Módulos afectados:** support, products (Support Inside es producto), tasks (mantenimientos generan tareas).
- **ADRs relacionados:** ADR-018 (catálogo dinámico), ADR-019 (config tipos), ADR-035 / ADR-037 (sistema de comunicación), ADR-057 (IA copilot).
- **Glosario:** [Support Inside](../00-foundations/glossary.md) — pendiente de añadir si no existe.
- **Implementación:** módulo Support Inside actualmente parcialmente modelado en schema. Lógica de slots pendiente.
- **Decisiones pendientes a cerrar:** nombres de planes, SLAs concretos, pricing definitivo.

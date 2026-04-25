# ADR-023 — Módulo de promociones y códigos de descuento

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §25 + §30
> **Domain:** products, marketing

---

## Contexto

Aelium necesita herramientas comerciales:

- **Upsell/crossell** en momentos clave (antes del checkout, en el dashboard, antes de renovar).
- **Códigos de descuento** para campañas, partners, captación de nuevos clientes.

Decisiones que cubre este ADR:

1. ¿Cómo se separan **extras** (ADR-020) de **promociones** y **códigos**?
2. ¿Dónde se gestionan estas reglas?
3. ¿Cómo evitar saturar al cliente con ofertas?

---

## Decisión

### Separación de tres sistemas

| Sistema | Naturaleza | Cuándo aplica | Configuración |
|---------|-----------|---------------|---------------|
| **Extras** (ADR-020) | Vinculados a producto específico | En checkout del producto al que están vinculados | Al crear el producto |
| **Promociones** | Mensajes contextuales activados por eventos | En momentos definidos (antes de checkout, dashboard, antes de renovar) | Página dedicada Marketing → Promociones |
| **Códigos de descuento** | Texto que el cliente introduce | En checkout, antes de confirmar pago | Página dedicada Marketing → Códigos |

> **Modelo B confirmado:** las reglas viven en página independiente del dashboard, NO en la ficha del producto. La ficha del producto solo MUESTRA qué promociones / códigos aplican (modo solo-lectura + enlace a la página de gestión).

### Promociones — los tres momentos

Cada promoción tiene un **trigger** (cuándo se muestra) y un **tipo** (upsell, crossell, descuento aplicable).

**1. Antes del checkout**
- Una sola sugerencia. Nunca lista de opciones.
- El cliente acepta con un clic. Nunca retrasa el proceso de pago.
- Ejemplo: "¿Quieres añadir SSL Pro al hosting que estás contratando?"

**2. En el dashboard del cliente**
- Banners contextuales (ej: "Tienes 3 servicios sin Support Inside — actívalo desde 9€/mes").
- Cliente puede descartar la promoción → no se vuelve a mostrar durante X días configurable.

**3. Antes de la renovación de un servicio**
- Email automático N días antes del vencimiento.
- Si hay promoción activa aplicable a ese servicio → se incluye.
- Ejemplo: "Renueva tu Web Pro un año más con 15% descuento."

### Códigos de descuento — configuración

```
CONFIGURACIÓN DE UN CÓDIGO
  Código: [texto libre o generado automáticamente]
  Tipo de descuento:
    ○ Porcentaje (X%)
    ○ Importe fijo (X€)
  Productos aplicables: [todos | selección de productos específicos]
  Categorías aplicables: [opcional, alternativa a productos]
  Límite de tiempo: [fecha de caducidad opcional]
  Límite de usos totales: [N opcional]
  Límite de usos por cliente: [N opcional]
  Ciclo aplicable: [mensual | anual | ambos]
  Solo para nuevos clientes: [Sí / No]
  Activo: [Sí / No]
```

### Restricción importante: una sola sugerencia

> **Antes del checkout: una sola sugerencia.** Nunca varias.

Razón: saturar al cliente con varias ofertas baja la conversión. La regla está en la matriz de promociones: si hay varias aplicables a un mismo trigger, una lógica de prioridad selecciona UNA (la más relevante según contexto).

### Upsell vs Crossell — definición

- **Upsell:** ofrecer una versión MEJOR del mismo producto. Ej: hosting Web Pro → Web Business.
- **Crossell:** ofrecer un producto DIFERENTE complementario. Ej: hosting → SSL Pro / dominio / Support Inside.

---

## Consecuencias

- ✅ **Ganamos:**
  - Tres sistemas claros, sin solapamiento conceptual.
  - Páginas dedicadas para gestión, no se mezcla con la ficha del producto.
  - Restricción "una sola sugerencia" protege la conversión.
- ⚠️ **Aceptamos:**
  - Construir tres sistemas con UI separada es trabajo significativo. **Estado actual: Subjects CASL definidos (`Promotion`, `DiscountCode`) pero módulo no implementado.** Pendiente sprint dedicado.
  - La lógica de prioridad para "una sola sugerencia entre varias aplicables" requiere reglas claras (orden manual + relevancia automática).
- 🚪 **Cierra:**
  - **No promociones múltiples al mismo cliente al mismo tiempo.**
  - **No mezclar extras con promociones.** Extras se configuran al crear producto; promociones en su página dedicada.

---

## Cuándo revisar

- Si los KPIs de conversión muestran que la regla "una sola sugerencia" deja oportunidades sobre la mesa: experimentar con A/B testing de listas controladas.
- Si surgen casos de uso (ej: cupones de socio del partner) que no encajan en los tres sistemas: añadir nuevo tipo o evaluar fusión.

---

## Referencias

- **Módulos afectados:** products (Subjects CASL definidos), billing (aplica códigos en checkout cuando exista módulo).
- **ADRs relacionados:** ADR-018 (catálogo), ADR-019 (configuración producto), ADR-020 (extras — distintos), ADR-032 (flujo de compra), ADR-054 (sistema de referidos).
- **Glosario:** [Producto](../00-foundations/glossary.md).
- **Estado de implementación:** módulo no construido. Sprint dedicado pendiente. Subjects CASL `Promotion`, `DiscountCode` ya definidos.

# ADR-022 — "We Do It For You" (deprecado por sistema de Proyectos)

> **Status:** Superseded by ADR-046 (Sistema de Proyectos, Sprint 22)
> **Date:** 2026-04 (decisión original) · 2026-04-26 (migración + supersede)
> **Original:** DECISIONS.md §8 + §44
> **Domain:** products

---

## Contexto

"We Do It For You" (WDIFY) era originalmente un **addon por producto**. La idea: el cliente con hosting Web Pro podía contratar "WDIFY" como addon que cubría tareas que el equipo de Aelium ejecutaba por él (instalar plugin, optimizar imágenes, etc.).

Tras experimentar con el modelo, se identificaron problemas:

1. **Granularidad rígida:** un addon "WDIFY" no podía cubrir variabilidad real (un cliente quiere 2 horas de trabajo, otro 20).
2. **Acuerdos de alcance:** al ser addon, el alcance estaba implícito ("tareas básicas") y generaba fricción cuando el cliente esperaba más.
3. **Falta de propuesta económica formal:** un addon es precio fijo recurrente, no encaja con desarrollos ad hoc que tienen presupuesto + entregables + aceptación.

Hace falta un modelo más flexible que cubra desarrollos personalizados con presupuesto, alcance acordado, fases (proposal → desarrollo → entrega → cobro), trazabilidad.

---

## Decisión

**WDIFY como addon por producto queda DEPRECADO.** Lo sustituye el **Sistema de Proyectos** (ver ADR-046, Sprint 22).

### Resumen del nuevo flow (detalle en ADR-046)

```
Cliente está en la página de su servicio (ej: hosting Web Pro)
     │
     ├──► Pulsa CTA "Solicitar desarrollo personalizado"
     │
     ▼
Se crea PROYECTO en estado `proposal` vinculado al servicio del cliente
     │
     ▼
Agente recibe la solicitud
     │
     ├──► Define alcance + precio + entregables + plazo
     ├──► Sube propuesta al cliente
     │
     ▼
Cliente revisa y acepta (o pide cambios)
     │
     ├──► Se cobra depósito (configurable por proyecto)
     │
     ▼
Estado: `in_progress`
     │
     ├──► Agente trabaja, sube avances al cliente
     │
     ▼
Estado: `delivered`
     │
     ├──► Cliente revisa la entrega
     │     ├──► Acepta → cobro final
     │     └──► Rechaza → vuelta a in_progress con feedback
     │
     ▼
Estado: `completed` (servicio activado / entregable subido)
```

### Razones para superseder

- Modelo de "proyectos" cubre WDIFY, desarrollo web custom, configuraciones especiales, **y** cualquier futuro caso de "trabajo del equipo cobrable" sin necesidad de crear un addon nuevo cada vez.
- Trazabilidad completa (estado, fechas, presupuesto, comunicación) en el modelo de proyectos.
- El cliente ve qué cobra y por qué, antes de pagar (transparencia).

### Migración

- **Productos `we_do_it`** existentes en el catálogo: marcados como `is_active: false`. No eliminados (R3 — datos históricos en facturas pasadas).
- **Servicios contratados WDIFY** activos al momento del cambio: se completan según el modelo antiguo. No se migran a proyectos retroactivamente.
- **CTA en página de servicio:** ya no contrata WDIFY. Crea proyecto en estado `proposal`.

---

## Consecuencias

- ✅ **Ganamos:**
  - Modelo flexible que cubre cualquier desarrollo custom.
  - Trazabilidad completa de propuesta → entrega → cobro.
  - Cliente ve presupuesto antes de pagar, sin fricción de alcance.
- ⚠️ **Aceptamos:**
  - Construcción del módulo Proyectos (Sprint 22) es trabajo significativo.
  - Coexistencia temporal: WDIFY como producto inactivo + proyectos activos. Documentación legacy.
- 🚪 **Cierra:**
  - **No nuevos addons "we_do_it" en el catálogo.** Toda solicitud de trabajo custom va por proyectos.

---

## Cuándo revisar

Esta decisión está **superseded**. Las revisiones se hacen en ADR-046 (Sistema de Proyectos).

---

## Referencias

- **Módulos afectados:** products (deprecación de tipo `we_do_it`), proyectos (nuevo módulo, ADR-046).
- **ADRs relacionados:** ADR-018 (catálogo dinámico), ADR-046 (Sistema de Proyectos — supersede este).
- **Documento legacy:** DECISIONS.md §8.
- **Implementación migración:** marcar productos `we_do_it` como inactivos en seed cuando se ejecute Sprint 22.

---

## Notas de revisión

> **2026-04-26:** ADR creado durante migración F2. Se documenta la decisión histórica (WDIFY como addon) **y** su superseción inmediata (proyectos) porque ambas viven en `DECISIONS.md` (§8 original y §44 nueva). Mantener este ADR sirve de trazabilidad: cualquiera que vea código viejo con `we_do_it` entiende por qué y dónde está el reemplazo.

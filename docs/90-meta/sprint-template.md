# Plantilla — Inicio de Sprint

> Copiar este documento y personalizar al arrancar cada sprint nuevo.
> Garantiza que el sprint declara contratos, dependencias y DoD desde el inicio.

---

# Sprint N — <título>

**Estado:** ⬜ planificación / 🟡 en curso / ✅ completado / ⛔ bloqueado
**Inicio:** YYYY-MM-DD
**Cierre estimado:** YYYY-MM-DD

---

## 1. Objetivo en una frase

> Una sola frase que un usuario no técnico entendería. Ejemplo:
> "Permitir que los clientes paguen sus facturas con tarjeta vía Stripe."

---

## 2. Depende de

Lista explícita de qué tiene que estar terminado **antes** de empezar este sprint.

| # | Dependencia | Estado | Bloquea qué del sprint |
|---|-------------|--------|------------------------|
| 1 | Sprint N-1 (módulo X) | ✅ / ⬜ | Pasos 2.x, 4.x |
| 2 | ADR-NNN sobre Y | ⬜ | Todo el sprint |
| 3 | Setting Z configurable | ✅ | Paso 3.x |

> Si una dependencia no está ✅, **no se arranca el sprint**. Se resuelve primero.

---

## 3. Produce (contratos nuevos)

Lo que este sprint añade al sistema. Lista explícita de:

### 3.1 Endpoints REST nuevos
- `POST /api/foo` — crea X. Auth: rol Y. Devuelve Z.
- `GET /api/foo/:id` — lee X.

### 3.2 Eventos nuevos emitidos
- `foo.created` — emitido por `FooService.create()`. Payload: `{id, user_id}`.
- `foo.updated` — emitido por `FooService.update()`. Payload: `{id, fields_changed}`.

### 3.3 Servicios inyectables nuevos
- `FooService` — métodos: `create`, `read`, `update`, `delete`.

### 3.4 Tablas o campos Prisma nuevos
- Tabla `foo` con campos: `id`, `name`, `user_id`, `created_at`, ...
- Campo `bar.foo_id` añadido como FK a `foo`.

### 3.5 Settings nuevos
- `foo_default_value` — entero, default 10, rango 1–100.

### 3.6 Permisos CASL nuevos
- `Action.Create` sobre `Subject.Foo` → solo rol admin.

---

## 4. Modifica (contratos existentes)

Cambios que afectan código que ya existía.

### 4.1 Endpoints modificados
- `POST /api/clients` ahora acepta campo opcional `foo_id`.

### 4.2 Servicios modificados
- `BillingService.createInvoice()` ahora acepta `discount_id` opcional.

### 4.3 Eventos cambiados
- `invoice.created` payload extendido con campo `foo_id`.

### 4.4 BREAKING changes
> Si hay alguno, ESCRIBIR `BREAKING CHANGE: ...` en el footer del commit final.
> Lista aquí también para visibilidad:
- (ninguno) / (lista)

---

## 5. Pasos atómicos

Cada paso = una sesión de trabajo razonable de Claude. Granularidad importa.

| # | Paso | Estado |
|---|------|--------|
| N.1 | Schema Prisma: añade tabla foo | ⬜ |
| N.2 | FooService: CRUD básico | ⬜ |
| N.3 | FooController: endpoints | ⬜ |
| N.4 | DTOs con validación class-validator | ⬜ |
| N.5 | Frontend: lista de foo | ⬜ |
| N.6 | Frontend: crear/editar foo | ⬜ |
| N.7 | Tests E2E del flujo | ⬜ |
| N.8 | docs/features/foo/admin.md | ⬜ |

---

## 6. Edge cases anticipados

Lista de casos límite que sabemos van a ocurrir. Resolverlos durante el sprint o asignar a sprint posterior.

| ID | Caso | Plan |
|----|------|------|
| EC-FOO-01 | Usuario crea foo con nombre duplicado | Devolver 409 Conflict |
| EC-FOO-02 | Borrado de foo con bar referenciado | Bloquear con 422 + mensaje |
| EC-FOO-03 | Concurrencia: dos usuarios crean foo simultáneamente | (Sprint N+1) |

---

## 7. Definition of Done

Verificación final antes de cerrar el sprint. Ver `docs/90-meta/definition-of-done.md` para el detalle de cada categoría.

### Código
- [ ] Todos los pasos N.1–N.X marcados ✅
- [ ] Build + typecheck + lint pasan
- [ ] CI verde en GitHub
- [ ] Tests E2E del flujo nuevo añadidos y verdes

### Documentación
- [ ] `docs/features/foo/admin.md` creado/actualizado
- [ ] ADRs creados si hubo decisiones (lista: ADR-NNN, ADR-MMM)
- [ ] `_events.md` actualizado con eventos nuevos
- [ ] `contract.md` del módulo actualizado

### Proceso
- [ ] Commits con Conventional Commits
- [ ] Edge cases pendientes movidos al backlog con justificación

### Smoke testing manual (Yasmin)
- [ ] Flujo nuevo verificado punta a punta en navegador
- [ ] Flujos críticos existentes siguen funcionando (login, factura, chat)
- [ ] Sin errores en consola del navegador
- [ ] UI cumple Design System

---

## 8. Riesgos identificados

| Riesgo | Impacto si ocurre | Mitigación |
|--------|-------------------|------------|
| Migración Prisma rompe datos existentes | Pérdida de datos en dev | Backup antes, migración reversible documentada |
| Plugin pago no listo para integrar | Sprint queda incompleto | Stub manual con `payment_provider: 'manual'` |

---

## 9. Decisiones registradas

ADRs creados durante este sprint (vincular):

- ADR-NNN — Decisión sobre X
- ADR-MMM — Decisión sobre Y

---

## 10. Cierre del sprint

> Rellenar al cerrar.

**Fecha real de cierre:** YYYY-MM-DD
**Commit final:** `<sha>`
**Cambios respecto al plan original:** breve resumen
**Items movidos a sprints futuros:**
- Item X → Sprint M (razón: ...)

**DoD verificado:** ✅ todo / ⚠️ con excepciones (listar)

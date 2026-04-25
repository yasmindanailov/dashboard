# Plan de migración F2 — DECISIONS.md → ADRs

> Plan operativo para partir `docs/DECISIONS.md` (~2.400 líneas, 48 secciones) en ADRs individuales. Auditoría completada 2026-04-26 antes de F2 ejecución.

---

## Hallazgos de la auditoría previa

### Inconsistencias detectadas

| # | Hallazgo | Acción en F2 |
|---|----------|--------------|
| 1 | **§40 ausente** entre §39 y §41 | No se migra (no existe). Probable renumerado en su día. |
| 2 | **§43 duplicada** (línea 1951 sin prefijo y línea 2055 con prefijo `§`) | La versión nueva (con prefijo) **supersede** a la legacy. ADR-043 = versión actual. ADR-042 = la legacy con `Status: Superseded by ADR-043`. |
| 3 | **Notación inconsistente** (§1-39 árabe simple, §41-§48 con prefijo `§`) | Todas migradas a `ADR-NNN` uniforme. La numeración antigua queda solo como referencia "Original". |
| 4 | **§33 "Decisiones pendientes"** — NO es una decisión, es un TODO list | NO se migra como ADR. Se traslada a `docs/60-roadmap/backlog.md` cuando F6 se ejecute. Mientras tanto: nota en DECISIONS.md indicando esto. |
| 5 | **§3 "Reglas de arquitectura"** ya migrada a `rules.md` | ADR meta corto: "ADR-003 — Extracción de reglas a documento canónico". Documenta la decisión de tener `rules.md` como fuente única. |
| 6 | **§18 "Orden de construcción (sprints)"** es un roadmap, no decisión | Se mueve a `60-roadmap/` cuando F6 se ejecute. Mientras tanto: ADR meta breve "ADR-018 — Estrategia de sprints incrementales". |
| 7 | **§35 "Módulo Partner"** y **§36 "Sistema de referidos"** son extensos (170+ líneas) | Se parten en múltiples ADRs por sub-decisión (ej: ADR-070 partner-roles, ADR-071 partner-comisiones, ADR-072 partner-payouts, etc.) |
| 8 | **§39 "Herramientas y librerías"** es lista descriptiva, no decisión | Convertir en ADR breve "ADR-039 — Stack de librerías elegidas" o fusionar con ADR-002 (stack tecnológico). |

### Decisiones de taxonomía

- **Numeración:** secuencial `ADR-001` … `ADR-NNN`, sin saltos. La numeración antigua (§N) NO se preserva como ID — solo como campo "Original".
- **Orden:** por **dominio**, no cronológico. Empezamos con foundations, luego dominios de negocio.
- **Naming:** `adr-NNN-titulo-kebab-case.md` (3 dígitos, español).
- **Plantilla:** `_template-adr.md` (7 secciones canónicas).
- **DECISIONS.md original:** se conserva como archivo legacy con header "MIGRADO" + punteros al ADR correspondiente.

---

## Mapeo previsto: §N → ADR-NNN

> Estimación de ~50 ADRs tras consolidación. Algunos §§ se fusionan, otros se parten.

### Bloque 1 — Foundations (ADR-001..010)

| ADR | Título | Origen | Notas |
|-----|--------|--------|-------|
| ADR-001 | Definición del proyecto y alcance | §1 | Meta — qué es Aelium Dashboard |
| ADR-002 | Stack tecnológico backend (NestJS + Prisma + Postgres + Redis) | §2 + §39 (parcial) | Fusión: stack core |
| ADR-003 | Extracción de reglas a documento canónico (`rules.md`) | §3 | Meta — explica por qué reglas viven en `00-foundations/` |
| ADR-004 | Arquitectura general por módulos + eventos | §4 | Patrón modular monolito orientado a eventos |
| ADR-005 | Stack tecnológico frontend (Next.js 16 + React 19 + Design System) | §39 (parcial) | Frontend específico |
| ADR-006 | Estrategia de tests (Jest unitarios + Playwright E2E) | §38 (parcial) | Si §38 contiene esto |
| ADR-007 | Estrategia de observabilidad (Pino + Sentry + correlation IDs) | §38 (parcial) + §31 | Logging y tracing |
| ADR-008 | Estrategia de sprints incrementales y orden de construcción | §18 | Migrará a roadmap en F6, mientras es ADR meta |
| ADR-009 | Estrategia de plugins (interface en core, implementación intercambiable) | §28 (parcial) + R4 | Patrón de plugins (provisioner, payment) |
| ADR-010 | Cumplimiento RGPD y retención de datos | §23 + §26 | Privacidad — fusión |

### Bloque 2 — Auth y seguridad (ADR-011..017)

| ADR | Título | Origen | Notas |
|-----|--------|--------|-------|
| ADR-011 | Roles del sistema (7 roles inmutables) | §5 | Roles is_system |
| ADR-012 | Autenticación con JWT (access + refresh) y rotación | §5 (parcial) + §20 | Tokens |
| ADR-013 | 2FA por email para roles privilegiados | §5 (parcial) | superadmin + agentes |
| ADR-014 | Bloqueo por intentos fallidos configurable | §20 (parcial) | Defensive |
| ADR-015 | Encriptación de credenciales con AES-256-GCM (Regla R12) | §31 (parcial) + R12 | Crypto |
| ADR-016 | Rate limiting por endpoint con Redis | §31 (parcial) + R10 | DDoS protection |
| ADR-017 | Audit log inmutable (Regla R3) | §13 | Auditoría |

### Bloque 3 — Products y catálogo (ADR-018..024)

| ADR | Título | Origen | Notas |
|-----|--------|--------|-------|
| ADR-018 | Catálogo dinámico de productos por tipo | §6 | Tipos de producto, configuración |
| ADR-019 | Configuración de tipos de producto (provisioner_type, audit_event_types, resource_config) | §27 | Config detallada |
| ADR-020 | Categorías y extras de producto | §19 | Estructura |
| ADR-021 | Provisioners — interfaz y reglas de desarrollo | §28 | Plugin pattern aplicado |
| ADR-022 | We Do It For You (WDIFY) como addon | §8 | Producto especial |
| ADR-023 | Promociones y códigos de descuento | §25 + §30 | Fusión: promos |
| ADR-024 | Eliminación de hosting_agency (partners venden hosting_web) | (decisión Sprint 5) | Histórica |

### Bloque 4 — Billing y servicios (ADR-025..033)

| ADR | Título | Origen | Notas |
|-----|--------|--------|-------|
| ADR-025 | Numeración secuencial de facturas (Hacienda RD 1619/2012) | §12 (parcial) | Invariante legal |
| ADR-026 | Estados de factura y transiciones | §12 (parcial) | draft → pending → paid \| overdue \| cancelled \| refunded |
| ADR-027 | IVA configurable por país (default 21% ES) | §12 (parcial) + §32 | Tax |
| ADR-028 | Suscripciones — ciclo de vida avanzado | §21 | Pause/resume/suspend/cancel |
| ADR-029 | Prorrateo en cambios de plan (mensual ↔ anual) | §21 (parcial) | Cálculo |
| ADR-030 | Período de gracia + reintentos de cobro | §12 (parcial) | Lifecycle |
| ADR-031 | Estrategia de payment providers (interface + plugin) | §34 | Stripe futuro |
| ADR-032 | Flujo de compra (checkout admin vs cliente) | §32 | Dos flujos |
| ADR-033 | Outbox Pattern para eventos críticos de billing | (deuda + R8) | **Nuevo** — registra la decisión arquitectónica de pendiente |

### Bloque 5 — Support (ADR-034..040)

| ADR | Título | Origen | Notas |
|-----|--------|--------|-------|
| ADR-034 | Support Inside — 3 planes con slots | §7 | Modelo de negocio support |
| ADR-035 | Sistema de comunicación (chat + tickets) | §9 | Legacy — referenciar ADR-037 |
| ADR-036 | Configuración del chat | §22 | Settings de support |
| ADR-037 | Arquitectura dual chat + tickets (Sprint 7.B) | §43 (versión nueva) | Supersede §43 legacy |
| ADR-038 | Notas estructuradas del cliente con categorías | §41 | Sprint 7.B |
| ADR-039 | Nota obligatoria en transiciones de estado | §42 | Sprint 7.B |
| ADR-040 | Rediseño de tickets (email-style) | §46 | Sprint 23 plan |

### Bloque 6 — Otros módulos (ADR-041..047)

| ADR | Título | Origen | Notas |
|-----|--------|--------|-------|
| ADR-041 | Sistema de tareas internas | §10 | Tasks |
| ADR-042 | Sistema de notificaciones internas (campana) | §11 | Notifications |
| ADR-043 | Infraestructura y servidores | §14 + §24 + §37 | Fusión: infra completa |
| ADR-044 | Configuración global (settings) extensa | §17 | Settings |
| ADR-045 | Gestión de clientes (CRM ligero) | §15 | Clients |
| ADR-046 | Sistema de proyectos | §44 | Sprint 22 plan |
| ADR-047 | Sistema de citas en comunicación | §47 | Sprint 24 plan |

### Bloque 7 — Partner y referidos (ADR-048..054)

| ADR | Título | Origen | Notas |
|-----|--------|--------|-------|
| ADR-048 | Modelo de negocio partner (canal de venta indirecta) | §35 (intro) | Foundation partner |
| ADR-049 | Roles y onboarding del partner | §35 (auth + onboarding) | Sub-decisión |
| ADR-050 | Permisos del partner (puede / no puede) | §35 (permisos) | Sub-decisión |
| ADR-051 | Comisiones y liquidaciones automáticas | §35 (comisiones) | Sub-decisión — outbox crítico |
| ADR-052 | Desvinculación cliente-partner | §35 (desvinculación) | Workflow |
| ADR-053 | Vinculación cuenta cliente con cuenta partner | §35 (cuenta cliente) | Descuento |
| ADR-054 | Sistema de referidos para clientes normales | §36 | Distinto de partners |

### Bloque 8 — Cross-cutting (ADR-055..060)

| ADR | Título | Origen | Notas |
|-----|--------|--------|-------|
| ADR-055 | Resiliencia: circuit breaker + retries + timeouts | §38 (parcial) | Patrón resiliencia |
| ADR-056 | Estrategia de escalabilidad (Sprint 13 ampliado) | §45 | Cuando aplique |
| ADR-057 | Agentes IA — configuración y alcance | §29 | IA filtro + copilot |
| ADR-058 | Integración con la landing | §16 | Punto de entrada |
| ADR-059 | Arquitectura de auth layout split-screen | §48 | UI auth |
| ADR-060 | Últimas decisiones antes del schema | §34 | Cleanup pre-schema |

---

## Decisiones que NO se migran como ADR

| § | Razón | Destino |
|---|-------|---------|
| §33 "Decisiones pendientes" | Es un TODO list, no decisión | `docs/60-roadmap/backlog.md` (cuando F6) |
| §40 (gap) | No existe en el documento | — |

---

## Estrategia de ejecución por sesiones

### Sesión 1 — F2.A — Foundations + Auth + Products (ADR-001..024)
- Producir 24 ADRs en lotes de 6-8
- Tiempo estimado: 2-3 horas
- Output: 24 archivos `adr-NNN-*.md` + actualizar índice en README.md

### Sesión 2 — F2.B — Billing + Support (ADR-025..040)
- Producir 16 ADRs (los más densos: invariantes legales, ciclos de vida)
- Tiempo estimado: 2-3 horas
- Output: 16 archivos + índice actualizado

### Sesión 3 — F2.C — Otros + Partner + Cross-cutting (ADR-041..060)
- Producir 20 ADRs
- Migrar §43 legacy a Status: Superseded by ADR-037
- Marcar DECISIONS.md original con header "MIGRADO" + punteros §N → ADR
- Tiempo estimado: 2-3 horas

### Sesión 4 (opcional) — Validación
- Revisar cross-references entre ADRs (cada "Related" apunta a archivo real)
- Asegurar que cada §N de DECISIONS.md tiene puntero al ADR correspondiente
- Tiempo: 1 hora

**Total estimado:** 3-4 sesiones, ~7-10 horas.

---

## Reglas de calidad por ADR

Para que cada ADR esté completo, debe tener:

- [ ] ID único, secuencial, sin saltos
- [ ] Las 7 secciones de la plantilla rellenadas (no "TBD")
- [ ] Status correcto (`Active` por defecto en migración)
- [ ] Campo `Original: DECISIONS.md §N` cuando aplique
- [ ] Al menos 1 referencia cruzada (a regla, módulo, otro ADR, glosario)
- [ ] "Cuándo revisar" con condición concreta (no genérica)
- [ ] Si reconstruyes opciones consideradas, hacerlo honestamente — no inventar

Si una § del original no tiene suficiente material para los 7 campos: **fusionarla con una § hermana** o convertir en ADR breve sin opciones (cuando claramente no había alternativa).

---

## Riesgos identificados

| Riesgo | Mitigación |
|--------|------------|
| Algunas §§ son muy escuetas → ADRs vacíos | Fusionar con vecinas semánticamente. Documentar fusión en notas. |
| Algunas §§ son muy extensas (Partner, Promociones) → ADRs gigantes | Partir en sub-decisiones. Cada ADR debe poder leerse en <5 min. |
| Reconstruir "opciones consideradas" puede inventar historia | Si el original no las menciona y no se recuerdan, escribir "(no documentado en origen — opción única conocida)" |
| Algunas §§ son TODO list, no decisiones (§33) | NO migrar. Documentar en este plan. |
| Cross-references entre ADRs pueden quedar rotas si se renumera | Producir TODOS los ADRs primero, links cruzados al final |

---

## Output esperado al cerrar F2

```
docs/10-decisions/
├── README.md                ← actualizado con índice completo
├── _template-adr.md         ← inmutable
├── _migration-plan.md       ← este archivo (referencia histórica del proceso)
├── adr-001-definicion-proyecto.md
├── adr-002-stack-tecnologico-backend.md
├── adr-003-extraccion-reglas-canonicas.md
├── ...
└── adr-060-decisiones-pre-schema.md
```

`docs/DECISIONS.md` queda así:

```markdown
# DECISIONS.md (LEGACY)

> ⚠️ MIGRADO A ADRs.
> Este documento se conserva por trazabilidad histórica.
> Las decisiones vigentes viven en `docs/10-decisions/`.

## Mapping § → ADR

| § original | ADR |
|-----------|-----|
| §1 | ADR-001 |
| §2 | ADR-002 + ADR-005 (parcial) |
| ... | ... |

(contenido original conservado abajo, sin modificaciones)
```

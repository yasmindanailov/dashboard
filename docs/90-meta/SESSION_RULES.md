# SESSION_RULES.md — Reglas operativas para el agente IA

> **Entry point real de cada sesión: [`/CLAUDE.md`](../../CLAUDE.md)** (se auto-carga) → [`docs/README.md`](../README.md) (índice maestro). Este archivo **complementa** con reglas operativas que no están en `rules.md`/ADRs.
> Actualizado: 2026-06-21 (reorg documental).

---

## Regla 0 — No abrir el navegador para exploración ad-hoc

El agente NO abre el navegador por su cuenta para "echar un vistazo"; el usuario da el feedback visual.
**Excepción:** los skills `verify` / `run` SÍ pueden conducir un navegador **cuando se invocan explícitamente** para verificar un cambio en la app real. Eso es uso dirigido, no exploración.

---

## Regla 1 — Documentar cada feature

Cada feature completado genera documentación en `docs/features/[módulo]/`.

| Audiencia | Archivo | Cuándo |
|-----------|---------|--------|
| **Admin** | admin.md | Siempre |
| **Agente** | agent.md | Cuando el feature es operativo para agentes |
| **Cliente** | client.md | Cuando el feature es visible para clientes |

Se escribe AL COMPLETAR el feature, no después.

---

## Regla 2 — Orden de lectura al iniciar sesión

Sigue el flujo de [`/CLAUDE.md`](../../CLAUDE.md) §1:

1. [`docs/README.md`](../README.md) — índice maestro / mapa.
2. [`docs/90-meta/audit-2026-06-21.md`](./audit-2026-06-21.md) — estado real medido.
3. [`docs/60-roadmap/current.md`](../60-roadmap/current.md) — sprint activo.
4. [`docs/00-foundations/rules.md`](../00-foundations/rules.md) + este archivo — reglas.
5. El `contract.md` del módulo que vas a tocar.

> Los monolitos legacy (`ROADMAP.md`, `DECISIONS.md`, `DATABASE_SCHEMA.md`) viven en `docs/99-archive/` — históricos, **NO fuente de verdad**. Las decisiones vivas están en `docs/10-decisions/` (ADRs).

---

## Regla 3 — Si hay ambigüedad, preguntar

Si una regla de negocio no está en DECISIONS.md → **preguntar al usuario**.
No inventar lógica de negocio. No asumir flujos que no estén documentados.

---

## Regla 4 — Validar el roadmap al cerrar un sprint

Al completar cada sprint, el agente DEBE:

1. **Commit** con Conventional Commits descriptivo del sprint.
2. **Actualizar `current.md`**: marcar fases ✅; al cerrar el sprint, mover su dossier a `completed/` con retrospectiva.
3. **Escribir/actualizar `admin.md`** en `docs/features/[módulo]/`.
4. **Verificar coherencia** entre `current.md`, `40-reference/ARCHITECTURE.md` y los ADRs (`10-decisions/`).
5. **Notificar al usuario** qué se completó y qué sigue.

Si algún documento tiene información contradictoria con la implementación actual,
corregirlo ANTES de avanzar al siguiente sprint.

---

## Limitaciones conocidas y mitigaciones

| Limitación | Mitigación |
|------------|------------|
| Pérdida de contexto en sesiones largas | Cada sesión = un sprint o menos. Documentar decisiones ANTES de implementar. |
| No hay memoria entre sesiones | Los .md del proyecto son la fuente de verdad. Los Knowledge Items dan contexto. |
| Errores en lógica de negocio compleja | TDD para billing, prorrateo, descuentos. Si no está en DECISIONS.md, preguntar. |
| Migrations destructivas | Siempre `prisma migrate dev --create-only` para revisar SQL. Seeds idempotentes. |
| Diseño visual requiere feedback humano | Describir qué debería verse, pedir al usuario que abra el navegador. |
| Exceso de tokens | Pasos pequeños, archivos uno a la vez, no generar bloques de código > 200 líneas. |

---

## Design system del dashboard

> **Fuente de verdad:** [`docs/40-reference/DESIGN_SYSTEM.md`](../40-reference/DESIGN_SYSTEM.md) + [`docs/40-reference/UI_SPEC.md`](../40-reference/UI_SPEC.md).
> Todo módulo nuevo o modificado DEBE cumplir estas reglas.
> El sistema de componentes está en `components/ui/` (30 componentes).
> Sprint 7.5 finalizó la auditoría completa de compliance.

```
LANDING (marketing)              →  DASHBOARD (herramienta)
Botones pill (radius full)       →  Botones radius 8px
Glass cards con glow             →  Cards sólidas, border sutil
Animaciones con delay            →  Transiciones solo de estado
Gradient mesh backgrounds        →  Fondos planos (#FFF y #F7F7F8)
Floating island nav              →  Sidebar fija izquierda
```

**Excepción:** La página de login usa la Aurora Digital en layout split-screen.

### Paleta

```
Brand:            #3B82F6
Brand hover:      #2563EB
Brand light:      #DBEAFE
Brand subtle:     rgba(59, 130, 246, 0.06)
Surface primary:  #FFFFFF
Surface secondary: #F7F7F8
Text primary:     #0A0A0B
Text secondary:   #6B7280
Text tertiary:    #9CA3AF
Border:           rgba(0, 0, 0, 0.06)
```

### Tipografía
DM Sans — pesos: 400 (body) · 500 (botones) · 600 (headings)

> Stack completo y versiones exactas: ver ARCHITECTURE.md.

### Workflow obligatorio al crear/modificar interfaz

1. Leer `DESIGN_SYSTEM.md` → componentes disponibles, anti-patrones
2. Leer `UI_SPEC.md` → anatomía de tu tipo de página, reglas de contenido
3. Usar SOLO componentes de `components/ui/` (importar vía barrel)
4. Usar SOLO tokens CSS de `globals.css` — nunca hex literales, nunca Tailwind
5. CSS Modules obligatorio — nunca `style={{}}` inline
6. Header comment con `Ref:` (Regla 15 de ARCHITECTURE.md)
7. Feedback: `Toast` para CRUD, `AlertBanner` solo para validación persistente
8. Loading: `<Skeleton>` para carga inicial, `<Button loading>` para acciones
9. Empty states: `<EmptyState>` con tono empático (DESIGN_SYSTEM.md §D1-D10)
10. Acciones destructivas: `<Modal>` — nunca `confirm()` / `alert()` nativo

---

## Workflow de desarrollo

```
1. docker compose -f docker/docker-compose.dev.yml up -d
   → PostgreSQL :5432 · Redis :6379 · MailPit :8025 (UI) :1025 (SMTP)

2. cd backend && pnpm run dev
   → API en localhost:3001 · Swagger en localhost:3001/api/v1/docs

3. cd frontend && pnpm run dev
   → Dashboard en localhost:3002
```

---

## Commits

```
feat:     nueva funcionalidad
fix:      corrección de bug
chore:    configuración, deps, scaffolding
docs:     documentación
refactor: reestructuración sin cambio funcional
test:     tests
```

---

## Documentos del proyecto

Mapa completo y clasificado (LIVE / REFERENCE / FUTURE / ARCHIVE) en el **índice maestro [`docs/README.md`](../README.md)**. No se duplica aquí para evitar drift de rutas (los monolitos legacy y los docs de marca/arquitectura se reubicaron en la reorg 2026-06-21).

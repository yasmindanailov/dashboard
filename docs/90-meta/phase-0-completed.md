# Fase 0 — Salvaguardas: completada

> Estado registrado al cerrar F0 (abril 2026, commits `0387ea6` → `0bd46ca`).

---

## Qué tiene el proyecto ahora que no tenía antes

Antes de F0, cualquier cambio podía:
- Compilar pero romper en runtime sin detectarse
- Mergear con tests rotos
- Llegar a producción con errores que solo un usuario reportaría
- Acumular deuda silenciosa de formato y tipos

Después de F0, cada cambio pasa por **6 capas automáticas de validación**:

```
Editor                                                                  Producción
   │                                                                        │
   ├── Husky pre-commit  ─────► lint-staged + ESLint + Prettier             │
   │                                                                        │
   ├── commitlint  ─────► Conventional Commits validados                    │
   │                                                                        │
   ├── Husky pre-push  ─────► typecheck backend + frontend                  │
   │                                                                        │
   ├── GitHub Actions CI:                                                   │
   │     • typecheck (bloqueante)                                           │
   │     • build backend + frontend (bloqueante)                            │
   │     • tests unitarios (bloqueante)                                     │
   │     • lint:check (informativo, hasta saneamiento completo)             │
   │     • E2E con Playwright + Postgres + Redis + MailPit (bloqueante)     │
   │                                                                        │
   └── Sentry (cuando se active SENTRY_DSN)                                 ▼
                                                              Errores reportados con
                                                              stack + contexto + replay
```

Si algo de esto falla, el merge no entra. Sin excepciones.

---

## Cobertura de tests E2E (estado v1)

7 tests verdes en CI. Cubren los 3 flujos críticos:

| Flujo | Tests | Detalle |
|-------|-------|---------|
| **Auth** | 2 | Registro → email verify → login completo. Login con email no verificado muestra opción de reenvío. |
| **Billing admin** | 2 | Acceso a listado de facturas. Acceso al checkout multi-step. |
| **Soporte** | 3 | Bandeja de tickets. Panel de chats en tiempo real. Modal de nuevo ticket. |

**Por cubrir** (siguientes iteraciones de F0.4):
- 2FA con código por email (todos los tests del admin ya pasan por este flujo, falta hacerlo aserción explícita)
- Crear factura completa via checkout multi-step
- Escalación chat → ticket con WebSocket real
- Descarga de PDF
- Tests de regresión visual

---

## Deuda técnica conocida (F0.6c/d/e — pendiente)

Reportes de lint en CI, no bloqueantes hoy:

| Categoría | Errores | Impacto |
|-----------|---------|---------|
| Backend `no-unsafe-*` (member-access, assignment, argument) | ~229 | Tipos `any` sin resolver, mayoría del Prisma client |
| Frontend `react-hooks/set-state-in-effect` | 27 | Anti-patrón con potencial impacto de rendimiento |
| Frontend `react-hooks/exhaustive-deps` | 6 | Stale state risk |
| Frontend `react-hooks/rules-of-hooks` | 1 | Bug crítico potencial |
| Frontend `no-explicit-any` | 73 | Tipado de respuestas API por mejorar |

**Cuando se sanee F0.6c/d/e**, `lint:check` pasará a bloqueante en CI y cualquier nuevo error parará el merge.

---

## Documentación operativa relacionada

| Pieza | Doc |
|-------|-----|
| CI / GitHub Actions | [`docs/90-meta/ci-setup.md`](./ci-setup.md) |
| Husky + lint-staged | [`docs/90-meta/git-hooks.md`](./git-hooks.md) |
| Conventional Commits | [`docs/90-meta/commit-conventions.md`](./commit-conventions.md) |
| Tests E2E | [`docs/90-meta/e2e-tests.md`](./e2e-tests.md) |
| Sentry (preparado, sin DSN) | [`docs/90-meta/sentry-setup.md`](./sentry-setup.md) |
| Definition of Done | [`docs/90-meta/definition-of-done.md`](./definition-of-done.md) |
| Plantilla de sprint | [`docs/90-meta/sprint-template.md`](./sprint-template.md) |

---

## Implicaciones operacionales

### Para Yasmin (operador del proyecto)
- **Cuando un PR sale rojo:** descarga el log o el artifact de CI; pega lo relevante a Claude. No mergees rojo.
- **Cuando vayas a cerrar un sprint:** copia `sprint-template.md`, rellena, valida cada punto del DoD.
- **Cuando despliegues a producción:** define `SENTRY_DSN` en el hosting para activar observabilidad.

### Para Claude (agente IA)
- **Antes de tocar código:** leer `docs/00-foundations/rules.md` y `glossary.md`.
- **Al cerrar una feature:** verificar que cada commit cumple Conventional Commits (`commitlint` lo enforza, pero entender la convención).
- **Al introducir un módulo nuevo:** crear su `contract.md` siguiendo plantilla F4 (cuando exista).

---

## Siguiente fase

**F1 — Foundations completados** ✅
Próxima parada: **F4 — Contracts por módulo + matrix de eventos + dependencias**.
Es la pieza con mayor impacto pendiente: convierte la doc de "lista de TODOs" en "contratos versionados" que cualquier agente puede validar.

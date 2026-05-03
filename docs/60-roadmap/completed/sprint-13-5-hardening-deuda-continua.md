# Sprint 13.5 — Hardening + Saneamiento de Deuda Continua (cerrado)

> **Cierre formal:** 2026-05-03 — Fases 13.5.A → 13.5.F mergeadas en master.
> **Foco doctrinal:** sprint dedicado a cerrar **deuda continua acumulada** (DCs registradas oportunistas que llevaban 4 sprints sin cerrarse). El ratio "DCs abiertas vs cerradas oportunistamente" llevaba meses negativo (Sprint 11 abrió 4, Sprint 16 abrió 6 cerrando 2). **Cero feature nueva** — pulida estructural antes de Sprint 15A Plugin Framework.
> **Cobertura final:** **183/183 unit verde + 118/118 E2E con suite reducida 2 specs (DC.34 eliminó tests del endpoint deprecated)**, sin regresión, 6 PRs encadenados (Fases A → F).

---

## 1. Objetivo en una frase (cumplido)

Cerrar **8 deudas continuas concretas** en 5 fases atómicas (B-F) sin añadir features de negocio: paralelización E2E + Playwright image (B — diferida tras evaluación), limpieza tasks/notes residual (C), UX cliente coherente (D), backend canónico (E), cierre documental (F). **Sprint 13.5 dejó el dashboard sin ruido residual antes de Sprint 15A**.

---

## 2. Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Sesiones | ~1 sesión densa |
| PRs / commits ahead of master | 6 commits encadenados (`e430dcf` plan + `fef5227` C + `7bab272` D + `5a71f34` E + Fase F + verif final) |
| Migraciones Prisma | 0 (Sprint 13.5 no tocó schema — sólo seed renombrado) |
| Cobertura unit final | **183/183 verde** sin regresión |
| Cobertura E2E final | **118/118 verde** menos 2 specs eliminados con motivo doctrinal (cubierta por path canónico via listener `handleUnassigned`) |
| ADRs nacidos | 0 (todas las DCs eran ejecutivas, no doctrinales) |
| DCs cerradas | **8** (DC.32 ✅ Sprint 16, ratificada · DC.33 ✅ · DC.34 ✅ · DC.14 ✅ · DC.37 ✅ · DC.38 ✅ · DC.8 ✅ parcial · DC.11 ✅ · DC.15 ✅ parcial) + drift seed support.auto_close_resolved_days |
| DCs diferidas tras evaluación | **2** (DC.13 + DC.27) → sub-sprint propio **Sprint 13.5.5 — CI Infra** |
| DCs recategorizadas | **1** (DC.5 — inventario auditado, recategorizada a continua oportunista) |

---

## 3. Cronología

| Hito | Salida | Commit |
|------|--------|--------|
| **Fase 13.5.A — Plan canónico congelado** (current.md doc-only) | Plan con 6 fases + DoD por DC + 6 riesgos | `e430dcf` |
| **Fase 13.5.B — DIFERIDA tras inspección** (DC.13 + DC.27) | Documentación del bloqueo cross-cutting + creación de Sprint 13.5.5 CI Infra como sub-sprint dedicado | (incluida en `e430dcf` patch) |
| **Fase 13.5.C — Limpieza tasks/notes residual** | DC.34 endpoint eliminado · DC.32/33 verificadas y cerradas · drift seed `support.auto_close_resolved_days` corregido | `fef5227` |
| **Fase 13.5.D — UX cliente coherente** | DC.14 AdminSidebar collapse + drawer móvil · DC.37 useConversationDetail con WebSocket · DC.38 ChatThreadView shared | `7bab272` |
| **Fase 13.5.E — Backend canónico** | DC.8 audit-auth listener · DC.15 endpoint /me/permissions · DC.11 doc E2E env · DC.5 inventario | `5a71f34` |
| **Fase 13.5.F — Cierre documental** | Backlog updates · retrospectiva · mover a completed/ | (este PR) |

---

## 4. Decisión doctrinal: diferir DC.13 + DC.27 (Fase 13.5.B)

Sprint 13.5 evaluó la complejidad real de DC.13 (paralelización E2E) y DC.27 (Playwright image) y concluyó:

### 4.1 DC.13 — paralelización E2E

La paralelización canónica requiere **reescritura completa** de:

- `tests/e2e/fixtures/db.ts` — schema dinámico Postgres por worker (cada worker = `?schema=worker_${index}`).
- `tests/e2e/fixtures/auth.ts` — cuentas seed por-worker (`e2e-${uid}-${role}`) + reescribir `loginSuperadminUI` para usar usuarios aislados.
- `tests/e2e/fixtures/mailpit.ts` — filtro por to-address + cleanup específico por worker.
- BullMQ `BULLMQ_PREFIX` por-worker.

**Estimación:** ~3-4h sólidas con riesgo alto sobre la suite 118/118 verde. Si falla mid-refactor, Sprint 13.5 entero queda bloqueado.

### 4.2 DC.27 — migrar CI E2E a `container: image: mcr.microsoft.com/playwright:v1.59.0-noble`

El cambio aparenta simple pero requiere:

- Cambiar todos los `localhost` env vars a nombres de service (`postgres`, `redis`, `mailpit`, `minio`).
- Reorganizar arranque MinIO (no admite `docker run` desde step dentro de container).
- Eliminar steps de cache de browsers (la imagen ya los trae).
- Pin major.minor sincronizado con `@playwright/test` del root.
- Verificación iterativa contra CI real (no testeable localmente).

**Riesgo:** alto si no verificado con commits aislados — un fallo silencioso bloquea todo el job E2E del CI durante Sprint 13.5.

### 4.3 Decisión

**Diferir ambas a sub-sprint propio "Sprint 13.5.5 — CI Infra"** dedicado a infra de tests con commits aislados verificables iterativamente. Sprint 13.5 procede con DCs C/D/E que tienen bordes claros y bajo riesgo.

**Lección operativa:** cuando un sprint declara N DCs, el sprint no es exitoso si las cierra todas a costa de romper la rama; es exitoso si cierra las que se pueden cerrar bien y deja registradas las que no.

---

## 5. Métricas de impacto por DC cerrada

### 5.1 DC.34 — endpoint `PATCH /tasks/:id/cancel` eliminado

| Antes | Después |
|-------|---------|
| Endpoint `@deprecated superadmin-only` con guard `ForbiddenException` | Eliminado. `service.cancel()` permanece para listeners cross-sistema |
| 2 tests E2E que ejercían el endpoint deprecated | Eliminados con comentario doctrinal del motivo |
| Doctrina ADR-079 §A2 vivía parcial en código | Doctrina vive 100% en código |

### 5.2 DC.33 — plantillas `conversation.resolved` + `conversation.auto_closed`

| Antes | Después |
|-------|---------|
| Eventos emitidos sin plantilla seedeada → fallback genérico | 4 entries seedeadas (2 events × 2 canales) con guard EC-T8-17 OK |
| Cliente recibía email genérico al resolverse ticket | Email con 3 caminos canónicos (responder/confirmar/esperar) + CTA |
| Agente sin notif cuando cron auto-cierra | Email + campana `conversation.auto_closed` |

### 5.3 DC.14 — AdminSidebar paridad cliente

| Antes | Después |
|-------|---------|
| Width 260px fijo | Toggle collapse desktop (260↔72px) + drawer móvil con backdrop |
| Sin persistencia preferencia | localStorage `admin.sidebar.collapsed` |
| Sin paridad con sidebar cliente | Mismas props canónicas (`collapsed`, `onToggle`, `mobileOpen`, `onMobileClose`) |

### 5.4 DC.37 — `useConversationDetail` con WebSocket

| Antes | Después |
|-------|---------|
| `/admin/support/[id]` y `/dashboard/support/[id]` con REST + reload manual | Socket `/support` + listeners `message:new`/`conversation:updated`/`typing:*` |
| Cliente no veía respuesta del agente hasta refresh | Mensaje aparece en vivo (paridad con widget flotante) |
| `peerTyping` no expuesto | `peerTyping` en el return del hook |

### 5.5 DC.38 — `ChatThreadView` shared

| Antes | Después |
|-------|---------|
| `ChatMessages.tsx` 128 LOC + `PanelChat.tsx` 140 LOC duplicados | `ChatThreadView.tsx` shared + 2 wrappers minimales (~60 LOC cada uno) |
| Fix en uno se olvidaba en el otro (2 veces durante Sprint 16) | Una sola fuente de verdad para lifecycle visual del chat |
| Sin contrato canónico de classes | Interface `ChatThreadClasses` documenta el mapping esperado |

### 5.6 DC.8 — audit-auth listener

| Antes | Después |
|-------|---------|
| 5 eventos `auth.*` huérfanos sin audit | `AuditAuthListener` consume y persiste vía `AuditService.logAccess(ip='system')` |
| `AuditAccessEntry.ip_address` required `string` | Opcional con fallback `''` para callers no-HTTP |
| 3 escrituras directas mantenidas (login_failed/registered/login_success) | Sin cambios — preservan IP/UA contextual del request HTTP |

### 5.7 DC.15 — endpoint `/api/v1/auth/me/permissions`

| Antes | Después |
|-------|---------|
| `SIDEBAR_PERMISSIONS` duplicado backend↔frontend con sync manual | Endpoint canónico filtrado al rol del usuario |
| Sin helper frontend | `authApi.myPermissions(token)` añadido |
| Sin trazabilidad doctrinal | Banner en `lib/permissions.ts` documenta fallback bootstrap + cierre Sprint 13 §13.AUTH |

### 5.8 DC.11 — doc E2E env coherente

| Antes | Después |
|-------|---------|
| Env vars dispersos entre `playwright.config.ts` y `ci.yml` sin doc | Nuevo `docs/50-operations/e2e-environment.md` con tabla exhaustiva |
| Errores comunes sin diagnóstico documentado | Tabla de síntomas → causa → solución |
| Sin referencia para Sprint 14 Deploy | §6 "Cuándo cambiar este documento" anticipa el paso |

### 5.9 Drift seed `support.auto_close_resolved_days`

| Antes | Después |
|-------|---------|
| Seed sembraba `support.auto_close_days` (legacy) | Seed siembra `support.auto_close_resolved_days` (canónica) |
| Servicio `SupportResolvedAutoCloseService` caía a default 7 hardcoded | La key sembrada coincide con la lectura del servicio |

---

## 6. Lo que aprendimos

### 6.1 El sprint dedicado de deuda fue necesario

El ratio "DCs abiertas vs cerradas oportunistamente" llevaba 4 sprints negativo. Sin sprint dedicado, las DCs se vuelven estructurales y degradan el ciclo de feedback. Sprint 13.5 cerró 8 DCs en una sola pasada — más de lo que oportunismo cerró en 4 sprints anteriores.

> **Patrón canónico:** cada 3-4 sprints feature, 1 sprint de saneamiento dedicado. Mantiene el ratio sano y evita refactors masivos posteriores.

### 6.2 Diferir DCs es profesional, no fracaso

Fase 13.5.B difirió DC.13 + DC.27 tras inspección. La alternativa hubiera sido intentarlas y arriesgar romper la suite 118/118 verde. Decisión correcta: documentar el bloqueo + crear sub-sprint propio + seguir con DCs viables.

### 6.3 Bordes claros aceleran sprints sin features

Las DCs C/D/E tenían bordes claros (qué tocar, qué no, cómo verificar). Eso permitió ejecutarlas en una sola sesión densa con typecheck/lint/tests verde tras cada commit. Cuando los bordes están borrosos, el sprint se atasca.

### 6.4 Cierres parciales son válidos cuando la migración es invasiva

DC.8 (audit-auth) y DC.15 (endpoint permisos) cerraron parcialmente:

- DC.8 mantiene 3 escrituras directas (las que tienen IP/UA contextual). Migrarlas vía bus pierde contexto — trade-off documentado.
- DC.15 expone el endpoint backend pero deja la hidratación al `AuthContext` para Sprint 13 §13.AUTH (cuando llegue SC + cookies). Romper login crítico ahora sería peor que el drift menor del matrix hardcoded.

> **Doctrina:** un cierre parcial documentado vale más que un cierre forzado que rompe estado verde.

### 6.5 Inventario > refactor masivo

DC.5 (R15 archivos restantes): 12 archivos backend `*.service.ts` >300 LOC, todos preexistentes. Refactorizar en bulk requiere ADR canónico de partición + sprint propio. **Recategorizada a continua oportunista** con inventario auditado preservado en backlog. Mejor que ignorarla en silencio o intentar refactorizarla apresuradamente.

---

## 7. Sub-sprint que nace del aprendizaje

### Sprint 13.5.5 — CI Infra (futuro, sub-sprint dedicado)

> **Disparador:** evaluación Fase 13.5.B identificó que DC.13 + DC.27 requieren commits aislados verificables iterativamente contra CI real.

**Alcance:**
- DC.13 paralelización E2E con fixtures aisladas por spec (~3-4h)
- DC.27 migrar a `container: image: mcr.microsoft.com/playwright:v1.59.0-noble` (~1-2h)

**Coste:** ~5-6h con verificación iterativa CI.
**Beneficio:** suite ~1min → ~15s + CI ~2min/run menos + elimina cuelgues `apt-get update`.
**Cuándo:** oportunista (cuando el flake reincida) o antes de Sprint 14 Deploy real.

---

## 8. Próximas vías legítimas (post Sprint 13.5)

Con Sprint 13.5 cerrado, la cola activa P2 vuelve a ser:

### Vía 1 (recomendada por defecto) — Sprint 15A Plugin Framework

> *"Implementa Sprint 15A — manifest plugin + loader dinámico desde Settings + encriptación API keys + helpers `core/provisioning/plugin-utils.ts` extendidos."*

- ~1-2 sesiones. Construye sobre ADR-077 (contrato congelado) + ADR-079 (bridge canónico tasks).
- Tras Sprint 13.5, el dashboard está sin ruido residual — momento ideal para el sistema operativo de plugins.

### Vía 2 — Sprint 13 §13.AUTH (cookies httpOnly + SC nativo)

> *"Implementa Sprint 13 §13.AUTH — cookies httpOnly + refresh rotation + CSRF middleware + frontend SC nativo bulk migrate."*

- ~3-5 sesiones. Bloquea Sprint 12+ por ADR-078 §5.
- Cierra DC.6 + DC.28 acoplados. Hidrata el endpoint `/me/permissions` al `AuthContext` (cierre 100% DC.15).
- Tras Sprint 13.5, los Client Components nuevos llevan marker `TODO(ADR-078, Sprint 13)` — la trazabilidad mecánica está lista.

### Vía 3 — Sprint 13.5.5 CI Infra

> *"Cierra DC.13 + DC.27 con commits aislados verificables iterativamente contra CI real."*

- ~5-6h. Acelera todos los sprints futuros (CI ~2min/run menos + suite local ~1min → ~15s).
- Útil si el flake `apt-get update` reincide o antes de Sprint 14 Deploy.

---

## 9. DoD Sprint 13.5 verificado

### Código
- [x] Backend: typecheck + lint:check + build + 183/183 unit verde sin regresión.
- [x] Frontend: typecheck + lint verde (49 warnings DC.6 esperados, 0 errors). Build verde.
- [x] Sin migración Prisma (no se tocó schema — sólo seed renombrado).
- [x] Cero `any` introducidos. Cero `as unknown as ...` añadidos.

### Por DC

- [x] **DC.34** — endpoint `PATCH /tasks/:id/cancel` eliminado del controller. 2 tests E2E borrados con comentario doctrinal.
- [x] **DC.32 verif** — `grep -rn "MaintenanceLog\.notes\|maintenance_logs\.notes"` devuelve 0 matches funcionales.
- [x] **DC.33** — plantillas `conversation.resolved` (cliente, email+internal) + `conversation.auto_closed` (agente, email+internal) seedeadas con guard EC-T8-17 OK.
- [x] **drift seed** — `support.auto_close_resolved_days` (key canónica) en `seeds/settings.ts`.
- [x] **DC.14** — AdminSidebar con `collapsed`/`onToggle`/`mobileOpen`/`onMobileClose`. Persistencia localStorage. Toggle desktop + drawer móvil con backdrop.
- [x] **DC.37** — `useConversationDetail` con socket `/support` + `conversation:join` al montar + listeners `message:new`/`conversation:updated`/`typing:*` + cleanup al desmontar.
- [x] **DC.38** — `<ChatThreadView>` shared en `_shared/support/chat/`. `ChatMessages.tsx` y `PanelChat.tsx` reducidos a wrappers minimales. Cero divergencia de comportamiento.
- [x] **DC.5** — inventario auditado registrado en backlog (recategorizada a continua oportunista).
- [x] **DC.8** — `AuditAuthListener` consume 5 eventos huérfanos canónicos. 3 escrituras directas con IP/UA contextual mantenidas conscientemente.
- [x] **DC.15** — endpoint `GET /api/v1/auth/me/permissions` filtrado al rol + helper `authApi.myPermissions()` + banner doctrinal en `lib/permissions.ts`. Hidratación AuthContext diferida a Sprint 13 §13.AUTH.
- [x] **DC.11** — `docs/50-operations/e2e-environment.md` (referencia canónica con env vars + topología + diagnóstico errores comunes).

### Documentación (Fase 13.5.F)
- [x] `docs/60-roadmap/backlog.md` actualizado: 8 DCs marcadas ✅ + DC.5 recategorizada + DC.13/DC.27 reapuntadas a Sprint 13.5.5.
- [x] Esta retrospectiva.
- [x] Sprint 13.5 movido de `current.md` a `completed/`.
- [x] `completed/README.md` con Sprint 13.5 añadido al índice cronológico.

### Proceso
- [x] Conventional Commits respetados (warnings de scope sólo informativos, no bloqueantes).
- [x] DCs diferidas (DC.13/27) tienen sub-sprint propio creado (Sprint 13.5.5 CI Infra) registrado en backlog.
- [x] Cierres parciales (DC.8, DC.15) tienen el camino de cierre 100% identificado (Sprint 13 §13.AUTH).

---

## 10. Documentación canónica vigente tras Sprint 13.5

- [`docs/60-roadmap/current.md`](../current.md) — Sprint 13.5 movido a `completed/`. Cabecera actualizada.
- [`docs/60-roadmap/backlog.md`](../backlog.md) — 8 DCs marcadas ✅ + 2 reapuntadas + 1 recategorizada.
- [`docs/50-operations/e2e-environment.md`](../../50-operations/e2e-environment.md) — referencia canónica E2E env (nuevo).
- [`backend/src/modules/audit/audit-auth.listener.ts`](../../../backend/src/modules/audit/audit-auth.listener.ts) — listener canónico audit auth.* (nuevo).
- [`backend/src/modules/auth/auth.controller.ts`](../../../backend/src/modules/auth/auth.controller.ts) §`getMyPermissions` — endpoint canónico permisos (nuevo).
- [`frontend/app/_shared/support/chat/ChatThreadView.tsx`](../../../frontend/app/_shared/support/chat/ChatThreadView.tsx) — componente shared canónico (nuevo).
- [`frontend/app/_shared/support/conversation/useConversationDetail.ts`](../../../frontend/app/_shared/support/conversation/useConversationDetail.ts) — hook con WebSocket (refactor).
- [`frontend/app/admin/AdminSidebar.tsx`](../../../frontend/app/admin/AdminSidebar.tsx) + [`admin-sidebar.module.css`](../../../frontend/app/admin/admin-sidebar.module.css) — paridad UX cliente (refactor).

---

> Sprint 13.5 cerrado al 100%. Cola activa P2: Sprint 15A Plugin Framework como cabeza de cola, Sprint 13 §13.AUTH como alternativa estratégica si se quiere desbloquear Sprint 12+, Sprint 13.5.5 CI Infra como sub-sprint oportunista cuando reincida flake.

# Development Playbook — Aelium Dashboard

> **Tu manual de operaciones para desarrollar este proyecto de forma profesional.**
> Si solo lees un documento de la carpeta `90-meta/`, que sea este.

---

## 1. Estado actual del proyecto (snapshot)

### Lo que está SÓLIDO

✅ **6 capas de validación automática activas** — typecheck, build, tests, lint, hooks pre-commit/pre-push, CI verde.
✅ **Tests E2E cubriendo los 3 flujos críticos** (auth, billing, support).
✅ **Documentación arquitectónica completa**:
- Reglas R1–R16 + D1–D11 unificadas en `docs/00-foundations/rules.md`
- Glosario canónico en `docs/00-foundations/glossary.md`
- Contracts de los 8 módulos en `docs/20-modules/`
- Matriz de dependencias y catálogo de eventos
- 60 ADRs individuales en `docs/10-decisions/` (F2 cerrado — `DECISIONS.md` legacy con mapping § → ADR)
- Schema partido por dominio en `docs/30-data/` (F3 cerrado — `DATABASE_SCHEMA.md` legacy con mapping tabla → archivo)
- Referencias operativas en `docs/50-operations/` (F5 cerrado — settings, plantillas, jobs, errores)
- Roadmap profesional en `docs/60-roadmap/` (F6 cerrado — current, backlog priorizado P0-P3, archive de sprints cerrados, plantilla activa)
- Auditoría código vs doc en `docs/90-meta/audit-2026-04-26.md` (verdad verificada que alimenta el roadmap)
- Definition of Done escrito y plantilla de sprint lista

✅ **Conformidad arquitectónica**:
- Regla R1 (módulos por eventos): 100% conforme
- Subservices Regla R15: aplicados correctamente en 5 módulos

### Lo que tiene DEUDA conocida

⚠️ **Outbox Pattern (R8)**: **4/25 eventos lo usan** — `invoice.*` (created/paid/failed/overdue) cerrado P0.2 (2026-04-26) vía `OutboxService` + `OutboxWorker` en `backend/src/core/outbox/`. Pendiente extender a `service.*` (4) y `checkout.completed` cuando se implemente provisioning, y a `partner.*` (4 futuros). ADR-033 documenta el patrón canónico.
⚠️ **Sprint 8 (Tasks) WIP** — el **mínimo desbloqueante** está cerrado (P0.1: listener `task.assigned`, validación FK `assigned_to`, tests E2E `tests/e2e/tasks.spec.ts`). El resto sigue pendiente y vive en [`current.md` §Sprint 8](../60-roadmap/current.md):
- Fase A: schemas `task_checklist_completions`, `maintenance_logs`, `product_checklist_items`, `service_checklist_items` (8.1b/c/d/14).
- Fase B: frontend Tablero + bloques adaptativos + ClientNotesTab vinculación (8.8b/c/d/e).
- Fase C: listeners `task.overdue`, `maintenance.*` + cron `not_completed_in_time` + WOW calls automáticos (8.2/3/10/12).
- Fase D: Support Inside (UX dedicada — ADR-061).
- Fase E: docs `admin.md` + `agent.md`.
- Eventos task aún huérfanos: `task.created`, `task.completed` (`task.assigned` ya tiene listener).
⚠️ **DC.6 — Frontend `set-state-in-effect`**: 27 warnings del patrón clásico `useEffect+fetch+setLoading` (regla nueva de eslint-plugin-react-hooks 7.x para React 19). Severidad bajada de `error` a `warn` en `frontend/eslint.config.mjs` con justificación. Plan: migrar fetching a Server Components + `use()`/Suspense en Sprint 7.5 Fase 2 o Sprint 13 Hardening — ver [`backlog.md` DC.6](../60-roadmap/backlog.md). El CI **no bloquea** por estos warnings (sólo por errors).
⚠️ **15 eventos huérfanos** (todos clasificados en `_events.md` como hooks aspiracionales para módulos futuros).
⚠️ **Sentry preparado, sin DSN configurado** — decisión consciente. Activar al desplegar a producción.
⚠️ **Crons en `@nestjs/schedule` (in-process)** — duplicarán trabajo si se escala a múltiples instancias. Migrar a BullMQ con leader election cuando aplique. El `OutboxWorker` actual usa `@Interval(5s)` por consistencia; migración a BullMQ planificada en P1.1 Sprint 9.

### Lo que NO existe todavía

❌ **8 módulos stub** sin implementación (audit, notifications, promotions, error-log, infrastructure, knowledge-base, provisioning, partner). Plan de cada uno en sus respectivos `contract.md`.
❌ **Plugin de pago real** (Stripe). Sprint dedicado post-Sprint 14.
❌ **Producción desplegada**. Hoy todo es localhost vía Docker.

---

## 2. Tu flujo de trabajo profesional

### Cuando arrancas un sprint nuevo

1. Copia [`docs/60-roadmap/_sprint-template.md`](../60-roadmap/_sprint-template.md) y rellénalo en una rama nueva, o añade tu sprint como sección a [`current.md`](../60-roadmap/current.md) si es continuación de uno en curso.
2. Rellena las 10 secciones de la plantilla **antes** de empezar a codificar:
   - Objetivo en 1 frase
   - Depende de
   - Produce (contratos nuevos: endpoints, eventos, modelos)
   - Modifica (contratos existentes)
   - Pasos atómicos
   - Edge cases anticipados
   - Definition of Done
   - Riesgos
   - Decisiones a registrar
3. Si el sprint introduce un módulo nuevo → crear `contract.md` siguiendo plantilla en `docs/20-modules/_template-contract.md` **antes** de codificar.
4. Si introduce decisión de arquitectura → crea un ADR en [`docs/10-decisions/`](../10-decisions/) (F2 cerrado: 60 ADRs vivos). Sigue el formato de los existentes (`adr-NNN-titulo-kebab.md`) y enlázalo desde el contract afectado.

### Cuando cierras un sprint

Ejecuta el [Definition of Done](./definition-of-done.md):
- [ ] Código: build, typecheck, tests, lint pasan
- [ ] CI verde tras último push
- [ ] Documentación: `contract.md`, `admin.md`, eventos en `_events.md` actualizados
- [ ] Smoke test manual (tú, en el navegador) de los flujos críticos
- [ ] Commits con Conventional Commits

### Cuando un PR / push sale rojo en CI

1. Abrir el run en `github.com/yasmindanailov/dashboard/actions`
2. Identificar el job rojo (Backend / Frontend / E2E)
3. Si **E2E rojo:** descargar artifact `playwright-report`. El HTML tiene screenshots y traces.
4. Pegarme el log relevante (no todo) y el contexto de qué tocaste.
5. **No mergees hasta que esté verde.**

### Cuando el dev server del frontend crashea (Turbopack worker)

Síntoma típico: `Jest worker encountered N child process exceptions, exceeding retry limit` al navegar a una página específica. Es un **crash del compilador Turbopack**, no un bug de tu código (Next.js 16 + Turbopack tiene este modo de fallo cuando la caché `.next/` se corrompe o el worker se queda sin memoria tras horas de desarrollo).

Procedimiento estándar (en este orden):

1. **Detén el dev server** del frontend con `Ctrl+C` en su terminal.
2. **Limpia caché:** `cd frontend && pnpm dev:clean` (alias de `rm -rf .next/`).
3. **Reinicia:** `pnpm dev`.
4. **Si reaparece tras limpiar caché**, fallback a webpack (más lento pero estable):
   ```bash
   cd frontend && pnpm dev:webpack
   ```
   Documentado en `node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md` como vía oficial de fallback.
5. **Si persiste con webpack**, abre issue: probablemente es un bug específico de la página (CSS module mal formado, importación circular, etc.). Léeme el log real del terminal (no el overlay del navegador) — el "Jest worker exception" oculta el error de fondo.

### Cuando vayas a desplegar a producción

1. Define `SENTRY_DSN` en el hosting → activa observabilidad.
2. Define `NEXT_PUBLIC_API_URL` real (no localhost).
3. Define los secrets sensibles (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`) — generar nuevos, no usar los de dev.
4. Configura SMTP real (Mailgun, SES, etc.) en lugar de MailPit.
5. Migra Postgres + Redis a managed services o instancias dedicadas.
6. **Antes del primer deploy:** cierra deuda Outbox al menos para `invoice.*` (R8). Es crítico legal/financiero.
7. Habilita branch protection en GitHub Pro/Team (cuando upgrade del plan Free).

---

## 3. Cuándo invocar a Claude y para qué

### Invocaciones de bajo coste (1 sesión, ≤30 min)

| Caso | Qué pedir |
|------|-----------|
| CI rojo | "CI rojo en commit X, log: ..." |
| Bug en local | "Esto no funciona, paso reproducción: ..." |
| Cambio puntual de UI | "Cambia el copy de X a Y en página Z" |
| Verificar que algo cumple las reglas | "¿Esta función cumple R5?" |

### Invocaciones medias (1 sesión, 30 min – 2 h)

| Caso | Qué pedir |
|------|-----------|
| Cerrar Sprint 8 (Tasks) | "Cierra Sprint 8: añade listener task.assigned, valida assigned_to, arregla los 2 errores lint" |
| Implementar feature pequeña | "Añade endpoint X con su contract.md actualizado" |
| Revisar PR | "Revisa estos cambios contra rules.md y _matrix.md" |
| Refactor R15 de un archivo | "Este archivo supera 300 líneas, divide en sub-services" |

### Invocaciones largas (1+ sesiones, ≥2 h)

| Caso | Qué pedir |
|------|-----------|
| Implementar módulo nuevo | "Implementa partner siguiendo `partner/contract.md`" |
| Sanear deuda técnica | "Resuelve los 229 errores no-unsafe-* del backend (F0.6c)" |
| Outbox Pattern para `invoice.*` | "Implementa Outbox para los 4 eventos invoice según R8" |
| Continuar refactor de doc | "Procede con F2 (ADRs) o F3 (schema por dominio)" |

### Patrón obligatorio al pedirme algo

Acompáñalo siempre con:
- **Contexto:** ¿qué módulo? ¿qué estás intentando? ¿qué has probado?
- **Referencias:** "según `billing/contract.md`", "para cumplir R8", etc.
- **Aceptación:** ¿cómo sabremos que está terminado? (DoD aplicable)

---

## 4. Refactor de documentación (F1–F9) — ✅ 100% completo

- ✅ F0 (7 salvaguardas)
- ✅ F1 (foundations: rules + glossary)
- ✅ F2 (60 ADRs individuales en `docs/10-decisions/`, `DECISIONS.md` marcado legacy con mapping § → ADR)
- ✅ F3 (`docs/30-data/` con 14 archivos por dominio, `DATABASE_SCHEMA.md` marcado legacy con mapping tabla → archivo)
- ✅ F4 (contracts + matrix + events) ⭐ la pieza más impactante
- ✅ F5 (`docs/50-operations/` con settings-reference, email-templates, jobs-reference, api-errors)
- ✅ F6 (`docs/60-roadmap/` con README, current, backlog priorizado P0-P3, archive de sprints 0-6 en `completed/`, plantilla activa). `ROADMAP.md` legacy con header puntero. **Auditoría 2026-04-26 alimenta el roadmap nuevo con verdad verificada.**
- ✅ **F7** (voz de marca: `DESIGN_SYSTEM.md §D11` y `UI_SPEC.md §P5` convertidos en punteros al canónico `aelium-documento-de-marca.md §VOZ DE MARCA` — sólo conservan ejemplos UI específicos)
- ✅ **F8** (`docs/20-modules/partner/admin.md` — guía operativa para administrar partners cuando el módulo se implemente)
- ✅ **F9** (`docs/90-meta/reading-order.md` — qué leer según tipo de tarea, optimizado por contexto)

**Estado de la documentación:** ✅ **completa al 100%.** El próximo paso natural es **abordar P0 del backlog** ([`docs/60-roadmap/backlog.md`](../60-roadmap/backlog.md)): cerrar Sprint 8 + Outbox `invoice.*` + F0.6 saneamiento lint.

---

## 5. Pendiente de desarrollo (features)

> 🎯 **P0 cerrado al 100% el 2026-04-26** (P0.1 + P0.2 + P0.3 + P0.4). El primer deploy productivo (Sprint 14) ya no tiene bloqueos críticos pre-deploy. La cola siguiente es **P1**.

### P1 — Importante para producción profesional (antes de desplegar)

1. **P1.1 Sprint 9 — Audit + Notifications Full** — audit consultas, portal transparencia cliente, plantillas editables, BullMQ emails, DLQ, **Outbox worker hardening (migrar de `@Interval` a BullMQ)**, Error Log UI. ~2-3 sesiones.
2. **P1.2 Sprint 11.5 — MinIO Storage local** — añadir MinIO al `docker-compose.dev.yml` + `StorageService` + integración con generación de PDFs. **Desbloquea adjuntos en chat (7.7) y tickets (7.6.3)**. ~1 sesión, independiente.
3. **P1.3 Sprint 7.5 Fase 2** — migración progresiva de páginas restantes al Design System. Oportunista (al tocar página, migrar en mismo PR).
4. **P1.4 Sprint 14 Deploy real** — Docker Compose **prod** + Traefik + SSL + Grafana/Prometheus/Loki + pipeline + backups Cloudflare R2 + plan recovery + Sentry real. Depende de P1.1+P1.2 cerrados. ~2-3 sesiones.

### Sprint 8 — pendiente residual (NO crítico, NO bloqueante)

El mínimo desbloqueante (P0.1) está cerrado. El resto del Sprint 8 vive en [`current.md`](../60-roadmap/current.md): schemas Fase A (`8.1b/c/d/14`), frontend Fase B, automatización Fase C (`task.overdue`, WOW calls, crons), Support Inside Fase D (ADR-061), docs Fase E. Se cerrará cuando se aborden las features que lo necesitan (ej. Sprint 9 desbloquea `task.overdue` + cron).

### Deuda continua documentada (`backlog.md` §Deuda continua)

- **DC.6** Migración fetch → Server Components + Suspense (cierra los 27 warnings `set-state-in-effect`). Sprint 7.5 Fase 2 o Sprint 13.
- **DC.5** R15 restantes (oportunista al tocar archivos).
- **DC.1-4** ver `backlog.md`.

### P2/P3 — Features grandes (cuando P1 esté)

5. **P2.1-5 Módulos pendientes** — Infrastructure, Provisioning, Settings, Knowledge Base, Hardening (ver `backlog.md` P2).
6. **P3.x Plugins + Fase 2** — Plugin framework, Stripe, ResellerClub, Docker Engine, Claude AI; Projects, CRM, Tickets redesign, Citations, AI Workers, Promotions, Referral, Partner module, i18n. Cada uno gobernado por su propio sub-sprint independiente — ver `backlog.md` P3.

---

## 6. Reglas de oro para no romper nada

### Antes de tocar código

1. Lee el `contract.md` del módulo afectado.
2. Si vas a modificar la API pública → planifica el cambio en el contract antes de codificar.
3. Si introduces evento → añádelo a `_events.md` antes de emitirlo.
4. Si vas a usar un nombre nuevo → busca primero en `glossary.md` por si ya existe canónico.

### Mientras codeas

5. Respeta R15: si un archivo crece más de los límites, divídelo en sub-services antes de añadir lógica nueva.
6. Si tu cambio toca un módulo del que dependen otros (ver matrix inversa) → ejecuta tests E2E completos.
7. Conventional Commits siempre. `commitlint` te ayuda.

### Antes de pushar

8. Pre-commit + pre-push corren solos. Si rechazan, no fuerces (`--no-verify`) salvo emergencia documentada.
9. CI verde antes de merge. Si tarda en pasar a verde, no acumules más cambios — arregla primero.

### Cosas que NO se hacen

❌ **Borrar una factura** (BILL-INV-2)
❌ **Eliminar el último ProductPricing activo de un producto** (PROD-INV-5)
❌ **Modificar tablas de audit** — solo INSERT (R3)
❌ **Importar plugin directamente desde core** (R4)
❌ **Tragar errores en frontend con `catch {}` vacío** (R14)
❌ **Calcular precio de factura en frontend** (R5)
❌ **Eliminar reglas de `rules.md` sin ADR** (sólo se modifican vía ADR)

---

## 7. Cuando algo se rompe en producción (futuro)

Hoy estás en localhost; cuando despliegues:

1. **Sentry** te llega por email. Investiga el correlation ID en los logs.
2. Buscar en logs por correlation ID → ver toda la cadena (request → eventos → jobs).
3. Hipótesis → reproducir local → fix → test que cubra → push → deploy.
4. **Documentar el incident** en `docs/60-roadmap/incidents.md` — el archivo no existe aún (lo creará el primer incident real post-deploy). Estructura sugerida: una entrada por incident con ID, fecha, severidad, sintomáticos, causa raíz, fix, follow-ups.
5. Si la causa es deuda conocida → priorizarla en próximo sprint.

---

## 8. Costes (referencia rápida)

| Servicio | Plan | Coste actual | Cuándo upgrade |
|----------|------|--------------|----------------|
| GitHub | Free privado | 0 € | Cuando necesites branch protection o equipo: GitHub Pro $4/mes |
| Sentry | Free (5k errores/mes) | 0 € | Si el volumen real supera 5k/mes |
| Hosting | (no decidido) | — | Cuando despliegues |
| Stripe | (no integrado) | — | Cuando se priorice plugin de pago |

---

## 9. Documentos clave (orden de lectura sugerido)

Cuando vuelvas tras tiempo, lee en este orden:

1. **`docs/90-meta/phase-0-completed.md`** — qué hay y por qué
2. **Este archivo** (`development-playbook.md`) — cómo procedo
3. **`docs/00-foundations/rules.md`** — qué nunca rompo
4. **`docs/00-foundations/glossary.md`** — términos
5. **`docs/20-modules/_matrix.md`** — cómo se conectan los módulos
6. **`docs/20-modules/<modulo>/contract.md`** del módulo que vayas a tocar
7. **`docs/10-decisions/README.md`** — índice de los 60 ADRs (consultar cuando una decisión no esté clara)
8. **`docs/30-data/README.md`** — índice de tablas por dominio (consultar antes de tocar el schema)
9. **`docs/50-operations/README.md`** — índice de settings, plantillas, jobs, errores (consultar antes de añadir cualquiera de los cuatro)
10. **`docs/60-roadmap/README.md`** — qué está en curso, qué viene priorizado P0-P3, qué se ha cerrado
11. **`docs/90-meta/audit-2026-04-26.md`** — última auditoría: estado real del proyecto (consultar si hay duda sobre coherencia código↔doc)

---

## 10. Mi recomendación honesta para tu próxima sesión

> Estado actualizado 2026-04-26: P0 cerrado al 100% (P0.1-P0.4). Refactor F1-F9 al 100%. La doc es ya completa y navegable. Lo que sigue es **P1**.

Mi recomendación: **una de estas dos**, y mi voto va a la **Opción A** porque la prioridad real ahora es habilitar el primer deploy productivo (Sprint 14), y P1.2 lo descongestiona con menor esfuerzo.

### Opción A (recomendada) — P1.2 Sprint 11.5: MinIO local
- "Implementa Sprint 11.5 — añade MinIO al `docker-compose.dev.yml`, crea `StorageService` con métodos `upload/download/delete/presignedUrl`, e integra con `InvoicePdfService` para guardar PDFs."
- ~1 sesión, **independiente** (no bloqueado por nada).
- **Desbloquea**: adjuntos en chat (Sprint 7.7) + adjuntos en tickets (Sprint 7.6.3) + persistencia de PDFs de facturas. Tres features de UX pegadas a la espera.
- Referencias: [`backlog.md` P1.2](../60-roadmap/backlog.md), `docker-compose.dev.yml` actual.

### Opción B — P1.1 Sprint 9: Audit + Notifications Full
- "Implementa Sprint 9 — Audit consultas + portal transparencia cliente + plantillas editables + BullMQ emails con DLQ + **Outbox worker hardening (migrar `@Interval` a BullMQ)** + Error Log UI."
- ~2-3 sesiones (más denso).
- **Cierra deuda histórica**: BullMQ leader election (playbook §1), DLQ para emails fallidos, audit trail completo con portal RGPD.
- Pre-requisito **directo** de Sprint 14 Deploy real: producción sin DLQ pierde emails silenciosamente.

### Por qué A antes que B
- A es atómico y demostrable en una sesión. B es 3 sub-piezas que sólo dan valor juntas.
- Tras A, tienes 2 features de UX (adjuntos chat/tickets) listas para programar oportunamente.
- B requiere trabajo previo de A NO, son ortogonales — pero A es prerequisito de Sprint 14 también (sin storage no se puede pasar de localhost a prod sin perder PDFs/adjuntos).

### Si tienes prisa por desplegar
Salta directo a **B → Sprint 14**. Pero en cuanto despliegues sin MinIO, los adjuntos quedarán colgando indefinidamente. A primero es la jugada limpia.

---

## 11. Seed y datos de prueba

> Documento canónico: [`docs/50-operations/seed-reference.md`](../50-operations/seed-reference.md).

El seed (`pnpm seed` desde `backend/`) es modular e idempotente desde
Sprint 9.6 Fase F.0. Cada `pnpm seed` deja la base de datos en un
estado conocido con:

- **7 cuentas canónicas** (1 por cada rol en `RoleSlug`):
  - `admin@aelium.net` / `AeliumDev2026!` (superadmin, requiere 2FA)
  - `agent.full@aelium.test` / `AgentFull2026!`
  - `agent.billing@aelium.test` / `AgentBilling2026!`
  - `agent.support@aelium.test` / `AgentSupport2026!`
  - `cliente@aelium.test` / `Cliente2026!`
  - `partner@aelium.test` / `Partner2026!`
  - `partner.pending@aelium.test` / `Partner2026!`
- **Datos de muestra mínimos**: 2 clientes adicionales, 2 productos
  con pricing real, 2 facturas (una `paid` + una `pending`), 1 ticket
  + 1 chat del cliente principal. Con marker `metadata.seeded = true`
  para limpieza selectiva futura.

**Salvaguardas**: cuentas demo `*.test` y datos demo NO se siembran si
`NODE_ENV === 'production'`. La cuenta superadmin sí (boot inicial).
Passwords overridables vía `SEED_*_PASSWORD` env vars.

**Cuándo re-seedear**:
- Tras `pnpm prisma migrate deploy` (cambio de schema borra/recrea
  tablas afectadas).
- Tras `pnpm prisma migrate reset` (resetea toda la DB).
- En CI antes de cada run de tests E2E.

Si añades un módulo de datos demo nuevo, sigue el patrón de
`backend/prisma/seeds/sample-<dominio>.ts` documentado en
`seed-reference.md` §"Estructura del seed".

---

## 12. Si te bloqueas

- **Si no entiendes una regla** → léela en `rules.md` con ejemplos. Si sigue confuso, pídeme que te explique con un caso concreto.
- **Si Claude propone algo que parece chocar con una regla** → cita la regla y pídele que justifique.
- **Si Claude pierde contexto entre sesiones** → primer mensaje de la sesión nueva: "Lee `docs/90-meta/development-playbook.md` y `docs/20-modules/<modulo>/contract.md`. Vamos a continuar X."
- **Si pierdes de vista qué pendiente tienes** → este archivo §4 y §5.

---

**Recuerda:** "robusto y profesional" no es un estado, es una práctica. Cada commit que respeta las reglas y la doc añade un grano de robustez. Cada atajo "solo por esta vez" la quita. Has invertido bien en la base — úsala.

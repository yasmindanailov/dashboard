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

⚠️ **Outbox Pattern (R8)**: ~~0/25~~ **4/25 eventos lo usan** — `invoice.*` cerrado P0.2 (2026-04-26). Pendiente extender a `service.*` (4) y `checkout.completed` cuando se implemente provisioning, y a `partner.*` (4 futuros).
⚠️ **Sprint 8 (Tasks) WIP** sin cerrar:
- 3 eventos `task.*` huérfanos (sin listener)
- `assigned_to` no validado en code
- 2 errores lint `no-unsafe-enum-comparison` pendientes
⚠️ **Lint deuda no-bloqueante en CI**: ~344 errores reales (no-unsafe-* en backend, hooks issues en frontend, no-explicit-any). Se sanearán en F0.6c/d/e.
⚠️ **15 eventos huérfanos** (todos clasificados en `_events.md` como hooks aspiracionales para módulos futuros).
⚠️ **Sentry preparado, sin DSN configurado** — decisión consciente. Activar al desplegar a producción.
⚠️ **Crons en `@nestjs/schedule` (in-process)** — duplicarán trabajo si se escala a múltiples instancias. Migrar a BullMQ con leader election cuando aplique.

### Lo que NO existe todavía

❌ **8 módulos stub** sin implementación (audit, notifications, promotions, error-log, infrastructure, knowledge-base, provisioning, partner). Plan de cada uno en sus respectivos `contract.md`.
❌ **Plugin de pago real** (Stripe). Sprint dedicado post-Sprint 14.
❌ **Producción desplegada**. Hoy todo es localhost vía Docker.

---

## 2. Tu flujo de trabajo profesional

### Cuando arrancas un sprint nuevo

1. Copia [`docs/90-meta/sprint-template.md`](./sprint-template.md) → `docs/60-roadmap/current-sprint.md` (cuando F6 esté hecho) o adapta al ROADMAP actual.
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
4. Si introduce decisión de arquitectura → ADR (cuando F2 esté hecho) o entrada en `DECISIONS.md` mientras tanto.

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

### URGENTE — antes de seguir construyendo

1. **Cerrar Sprint 8 (Tasks)** — listener `task.assigned`, validación `assigned_to`, arreglar 2 lint errors. ~1-2 sesiones.
2. **Outbox Pattern para `invoice.*`** — crítico financiero antes de producción. ~1-2 sesiones.

### IMPORTANTE — antes de despliegue

3. **F0.6 saneamiento profundo** — los 344 errores de lint reales. ~3-4 sesiones repartidas.
4. **Tests E2E exhaustivos** — 2FA con código real, checkout completo, PDF download, escalación con WS. ~2 sesiones.

### FEATURES grandes pendientes (cuando lo anterior esté)

5. **Plugin Stripe** — sprint dedicado, requiere cuenta Stripe + webhooks.
6. **Módulo Provisioning** — listeners de `service.*` y `checkout.completed`. Activación automática Docker / Enhance CP.
7. **Módulo Partner** — todo el plan en `partner/contract.md`. Es el más extenso (Fase 2 del proyecto).
8. **IA — filtro chat + copilot agente** — requiere Sprint 15 con infra de IA.

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
4. **Documentar el incident** en `docs/60-roadmap/incidents.md` (cuando F6 lo cree).
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

Cuando vuelvas a Claude, mi recomendación es **una de estas dos**:

### Opción A — Cerrar Sprint 8 y continuar features
- "Cierra Sprint 8 según `tasks/contract.md` sección 17 (deuda técnica)"
- Esto deja el módulo Tasks listo y consistente con la doc.
- Después: implementar Outbox para `invoice.*` (R8 crítica antes de prod).

### Opción B — Continuar refactor de doc (F3)
- "Procede con F3: parte `DATABASE_SCHEMA.md` (~2k líneas) en archivos por dominio en `docs/30-data/`"
- ~1-2 sesiones. Útil para localizar tablas concretas sin scrollear el monolito.
- F2 (ADRs) y F5 (operations) ya están cerrados — la doc es ya navegable y profesional.

**Mi voto:** **Opción A**. La doc actual es ya **excelente para desarrollar profesionalmente**: 60 ADRs, contracts por módulo, matriz de dependencias, catálogo de eventos, reglas explícitas, y carpeta de operations con settings/emails/jobs/errores canónicos. **El Sprint 8 sí bloquea** (está WIP, ensucia el repo). Cierra primero, organiza el schema después.

---

## 11. Si te bloqueas

- **Si no entiendes una regla** → léela en `rules.md` con ejemplos. Si sigue confuso, pídeme que te explique con un caso concreto.
- **Si Claude propone algo que parece chocar con una regla** → cita la regla y pídele que justifique.
- **Si Claude pierde contexto entre sesiones** → primer mensaje de la sesión nueva: "Lee `docs/90-meta/development-playbook.md` y `docs/20-modules/<modulo>/contract.md`. Vamos a continuar X."
- **Si pierdes de vista qué pendiente tienes** → este archivo §4 y §5.

---

**Recuerda:** "robusto y profesional" no es un estado, es una práctica. Cada commit que respeta las reglas y la doc añade un grano de robustez. Cada atajo "solo por esta vez" la quita. Has invertido bien en la base — úsala.

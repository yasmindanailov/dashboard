# Operations — Aelium Dashboard

> **Referencias operativas vivas.**
> Catálogos canónicos que cualquier sesión consulta antes de tocar settings, plantillas, jobs o errores. Sin esto, cada sesión inventa nombres, duplica plantillas o devuelve códigos de error inconsistentes.

---

## Por qué existe esta carpeta

Los `contract.md` por módulo describen **qué hace** cada módulo. Los ADRs describen **por qué**. Las reglas describen **cómo**. Pero hay tres preguntas operativas que no encajan en ninguno de esos tres y que se hacen constantemente al tocar el sistema:

1. **¿Qué settings ya existen?** — para no inventar `billing.payment_due_days_v2` cuando ya hay `billing.payment_due_days`.
2. **¿Qué plantilla de email se dispara con este evento?** — para no escribir una nueva si ya existe la canónica.
3. **¿Qué jobs/crons corren y cuándo?** — para no programar dos veces lo mismo.
4. **¿Qué error code devuelve el backend para este caso?** — para que frontend y backend hablen el mismo lenguaje.

Esos cuatro catálogos viven aquí.

---

## Documentos

| Documento | Para qué sirve | Cuándo consultarlo |
|-----------|----------------|--------------------|
| [`settings-reference.md`](./settings-reference.md) | Catálogo completo de settings configurables (key, tipo, default, consumidor) | Antes de añadir un setting nuevo o consumir uno existente |
| [`email-templates.md`](./email-templates.md) | Catálogo de plantillas de email/notificación con sus variables, eventos y canales | Antes de crear una plantilla nueva o disparar una notificación |
| [`jobs-reference.md`](./jobs-reference.md) | Catálogo de crons y jobs BullMQ con triggers, reintentos, idempotencia | Antes de programar un cron o job nuevo |
| [`api-errors.md`](./api-errors.md) | Catálogo de errores canónicos (HTTP status, code interno, mensaje) + shape unificado | Al lanzar excepciones nuevas o manejarlas en frontend |
| [`seed-reference.md`](./seed-reference.md) | Estructura del seed idempotente + cuentas/datos demo canónicos | Antes de tocar el seed o asumir datos de prueba |
| [`e2e-environment.md`](./e2e-environment.md) | Entorno y variables para la suite E2E (Playwright + mocks) | Antes de correr/escribir E2E |

---

## Convenciones generales

### Naming

- **Settings:** `<dominio>.<key_snake_case>` — ej: `billing.invoice_prefix`, `auth.max_login_attempts`.
- **Plantillas:** nombre descriptivo en kebab-case + dominio — ej: `auth.verify-email`, `billing.invoice-paid`.
- **Jobs:** `<dominio>.<accion>` — ej: `billing.lifecycle-check`, `support.cleanup-guest-sessions`.
- **Errores:** `SCREAMING_SNAKE_CASE` por code interno — ej: `INVOICE_NOT_FOUND`, `EMAIL_ALREADY_EXISTS`.

### Mantener actualizados los catálogos

Estos documentos **se desactualizan rápido** si nadie los mantiene. La regla:

- **Quien añade** un setting / plantilla / job / error → actualiza el catálogo en el mismo PR.
- **Quien renombra o elimina** algo → marca el cambio explícitamente (no borra silenciosamente — añade nota "renombrado a X" o "eliminado en Sprint N").
- **Auditorías periódicas** (cada cierre de sprint mayor) — Claude puede ejecutar la búsqueda de drift en código vs catálogo.

### Estado vs aspiración

Cada catálogo distingue **lo que está implementado hoy** de **lo que está documentado pero pendiente**. Ambos son útiles: el primero te dice qué puedes consumir; el segundo te dice qué viene y por qué.

Indicadores:
- ✅ implementado y consumido
- 🟡 implementado pero sin consumidor (hook aspiracional o feature futura)
- ❌ documentado, no implementado
- ⚠️ con deuda conocida (ej: sin Outbox, sin validación, etc.)

---

## Cómo se relaciona con el resto

| Si quieres saber... | Ve a... |
|---------------------|---------|
| Qué hace un módulo | `docs/20-modules/<modulo>/contract.md` |
| Por qué se decidió algo | `docs/10-decisions/adr-NNN-*.md` |
| Qué reglas globales aplican | `docs/00-foundations/rules.md` |
| Qué eventos existen | `docs/20-modules/_events.md` |
| Qué dependencias hay entre módulos | `docs/20-modules/_matrix.md` |
| **Qué setting / plantilla / job / error usar** | **esta carpeta** |

---

## Documentos relacionados

- [`docs/00-foundations/rules.md`](../00-foundations/rules.md) — Reglas R1–R16 + D1–D11
- [`docs/00-foundations/glossary.md`](../00-foundations/glossary.md) — Términos canónicos
- [`docs/10-decisions/`](../10-decisions/) — ADRs (60 decisiones arquitectónicas)
- [`docs/20-modules/`](../20-modules/) — Contracts por módulo + matriz + catálogo de eventos
- [`docs/90-meta/development-playbook.md`](../90-meta/development-playbook.md) — Manual de operación profesional

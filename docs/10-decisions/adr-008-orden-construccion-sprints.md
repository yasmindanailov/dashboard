# ADR-008 — Estrategia de sprints incrementales

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §18
> **Domain:** foundation, process

---

## Contexto

El alcance del dashboard es amplio: 10+ módulos, plugins de pago, provisioners externos, soporte realtime, partner system, IA, RGPD. Construir todo en paralelo es inviable para un equipo pequeño + IA. Hace falta un **orden** que:

1. Desbloquee funcionalidad útil cuanto antes (cliente puede contratar, recibir factura, abrir chat).
2. Construya las dependencias antes que los dependientes (auth antes que clients, billing antes que partner).
3. Permita validar cada sprint con un flujo end-to-end demostrable.

Sin un orden explícito, se acumula trabajo a medias en muchos frentes.

---

## Opciones consideradas

1. **Construcción horizontal por capa** (todos los modelos, luego todos los services, luego todos los controllers).
   - Pros: aparenta progreso uniforme.
   - Contras: nada funciona end-to-end hasta el final. Imposible validar producto antes de tener todo.

2. **Construcción vertical por feature de cliente final** (primero "puede contratar hosting", luego "puede ver facturas", etc.).
   - Pros: cada sprint demostrable.
   - Contras: tiende a saltarse la base (auth, audit, settings) que se necesita después.

3. **(Elegida)** **Construcción por dependencias arquitectónicas** + cierre de cada sprint con UI funcional vertical.
   - Pros: la base está cuando se necesita; cada sprint tiene UI demostrable.
   - Contras: sprints iniciales son menos vistosos (auth + scaffolding).

---

## Decisión

**Orden de sprints** (numerados; nombres conceptuales — números reales pueden expandirse en sub-sprints como Sprint 7.5, 7.B):

### Sprint 0 — Scaffolding
Monorepo, Docker Compose dev (Postgres + Redis + MailPit), NestJS scaffolding, Prisma init, seed, ExceptionFilter, CorrelationId, Helmet, CORS, Swagger, Next.js + DM Sans + tokens, login page split-screen, README.

### Sprint 1 — Auth completo
Auth + roles (7 fijos) + 2FA por email para roles privilegiados + sesiones + bloqueo por intentos fallidos + verify email + forgot/reset password + frontend completo del flow auth + 11 settings de auth configurables.

### Sprint 2 — Notifications core
MailPit integrado, EmailService con SMTP configurable, EmailModule global, 4 plantillas auth (verify, 2FA, reset, welcome), AuthService elimina TODOs y envía emails reales.

### Sprint 3 — Auth frontend polish + hardening
Páginas register, verify-email, forgot-password, reset-password. Test e2e auth completo. Protección de rutas. Auto-refresh token. UI "email no verificado" con opción de reenvío.

### Sprint 4 — Clients (CRM)
RolesGuard + auto-creación ClientProfile al register + paginación reutilizable + BillingProfile + ClientsService CRUD + ClientsController + frontend sidebar/layout + tabla clientes + ficha cliente con tabs + notificación interna placeholder.

### Sprint 5 — Products + dashboard role-aware
PBAC con CASL (reemplaza @Roles()) + sidebar role-aware + manejo 403 + sidebar mobile + ProductsService CRUD + pricing + extras + tipos + frontend catálogo y CRUD productos.

### Sprint 6 — Billing engine
BillingService (estados, cálculos, IVA), numeración secuencial, PaymentProvider interface, ciclo de cobro, suspensión y cancelación automática, prorrateo, pausar suscripción, período de gracia, facturas manuales, generación PDF, frontend checkout, lista facturas, detalle, emails, hardening de seguridad.

### Sprint 7 — Support + Design System foundation
Support core (chats + tickets + escalación), WebSocket, panel agente, hardening de Sprint 7.H1-25, Sprint 7.5 = Design System foundation con 30 componentes en `components/ui/`.

### Sprint 8 — Tasks
Sistema de tareas internas para el equipo. **Estado actual:** WIP a cerrar.

### Sprint 9-15 — Audit log, infra, plugins (Stripe), IA, RGPD portal, etc.

> **Detalle completo en `docs/ROADMAP.md`** (legacy hoy; migrará a `docs/60-roadmap/` en F6 del refactor de doc).

### Reglas operativas

1. **Cada sprint cierra con su Definition of Done** (ver `docs/90-meta/definition-of-done.md`).
2. **Cada sprint nuevo abre con la plantilla obligatoria** `docs/90-meta/sprint-template.md` (depende de, produce, modifica, edge cases, DoD).
3. **No empezar sprint nuevo sin cerrar el anterior.** El WIP a medias es deuda.
4. **Cada sprint puede subdividirse** en sub-sprints (3.5, 7.B, 7.5) cuando un dominio requiera hardening separado.

---

## Consecuencias

- ✅ **Ganamos:**
  - Cada sprint entrega un flujo demostrable: al cerrar Sprint 1, hay login real; al cerrar Sprint 6, hay facturación real; etc.
  - Las dependencias arquitectónicas se respetan (auth antes que clients, billing antes que partner).
  - Sub-sprints permiten parar a estabilizar sin "saltar al siguiente".
- ⚠️ **Aceptamos:**
  - Sprints iniciales no tienen UI vistosa. Cliente externo no entiende el progreso. Mitigación: el operador es interno, no hay cliente que justificar.
  - Algunos sprints terminan con TODOs aceptados como deuda (siempre documentados, p.ej. Sprint 5 EC-1..EC-10).
- 🚪 **Cierra:**
  - **No saltarse sprints "por urgencia comercial".** Las dependencias técnicas no entienden de prioridades de negocio: si se rompe el orden, el siguiente sprint construye sobre cimientos frágiles.

---

## Cuándo revisar

- Al cerrar cada bloque de sprints (cada ~3-4 sprints): pausa, balance, ajuste del orden restante.
- Si surge una restricción legal o comercial que obligue a anticipar un sprint posterior (ej: regulación nueva que obliga a tener RGPD antes de lo previsto).
- Si una decisión arquitectónica de un sprint posterior invalida lo construido en uno anterior, requiere ADR de revisión + plan de migración.

---

## Referencias

- **Módulos afectados:** todos (cada sprint construye un módulo).
- **Reglas relacionadas:** ninguna directa; conecta con DoD y plantilla de sprint.
- **ADRs relacionados:** todos los siguientes ADRs detallan decisiones de los sprints específicos.
- **Documentos:** [`docs/ROADMAP.md`](../ROADMAP.md), [`docs/90-meta/sprint-template.md`](../90-meta/sprint-template.md), [`docs/90-meta/definition-of-done.md`](../90-meta/definition-of-done.md).

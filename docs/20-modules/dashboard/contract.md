# dashboard — Contract

## 1. Propósito

Página de aterrizaje del usuario tras login. Muestra un overview agregado **role-aware**: stats, alerts, accesos rápidos. Cada rol ve un overview distinto según los datos a los que tiene acceso.

Es un módulo **aggregator de solo lectura**: NO posee tablas, NO emite eventos, NO consume eventos. Su única responsabilidad es leer datos de muchos módulos y componer una vista coherente.

---

## 2. Estado de implementación

✅ **Producción.** Sprint 5 cerrado, refactor Regla 15 aplicado en Sprint 7.R15.1 (`overview/page.tsx`: 907→77 líneas, secciones y stats extraídos).

> **GL-22 (audit 2026-06-25):** el overview role-aware del **staff** se renderiza
> en el portal admin (`/admin`), no en `/dashboard` (de donde el `dashboard/layout`
> rebota al staff por ADR-066). `frontend/app/admin/page.tsx` consume el mismo
> `GET /dashboard/overview` (backend ya role-aware: superadmin/agent_full → `admin`,
> agent_billing/agent_support → `agent`) y reutiliza `AdminStats`/`AgentStats` +
> `buildAlerts`/`AlertList` (antes código muerto). El portal **cliente**
> (`/dashboard`) renderiza el overview de `client`/`partner`. Accesos rápidos del
> admin gateados por `canAccess` (ADR-067).

---

## 3. Modelos Prisma propios

Ninguno. Dashboard no posee tablas.

---

## 4. Modelos foráneos accedidos

Por su naturaleza de **aggregator**, accede en lectura a múltiples tablas:

| Tabla | Módulo dueño | Tipo | Razón |
|-------|--------------|------|-------|
| `users` | auth | lectura | Total de usuarios, breakdown por rol, registros recientes |
| `invoices` | billing | lectura | Stats: total revenue, pending, overdue, paid |
| `services` | billing | lectura | Activos, suspended, paused, cancelados |
| `conversations` | support | lectura | Pendientes, resueltas, asignadas a mí |
| `tasks` | tasks | lectura | Pendientes, hoy, semana |

**Patrón:** lecturas agregadas (`count`, `aggregate`) en consultas Prisma con `select` específico — nunca trae rows completas, solo métricas.

> ✅ **Lectura legítima** confirmada en auditoría. No es violación de R1 — es el patrón aggregator estándar para vistas de overview.

---

## 5. API REST expuesta

Prefix: `/api/v1/dashboard`. JWT auth.

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `GET` | `/dashboard/overview` | Stats agregadas según rol del usuario | `Read.Dashboard` (todos los roles) |

> **Una sola ruta** porque toda la lógica role-aware se resuelve en el service. Si crece, considerar split por dominio (`/dashboard/billing-stats`, `/dashboard/support-stats`, etc.).

---

## 6. WebSocket gateway

N/A. El overview se carga al entrar y al refrescar. No hay actualizaciones en tiempo real (decisión: el dashboard de overview no necesita ser realtime; los WebSockets viven en el panel de soporte).

---

## 7. Eventos emitidos

Ninguno. Dashboard solo lee.

---

## 8. Eventos consumidos

Ninguno.

> **Considerar futuro:** invalidar cache si se introduce caching de stats. Hoy las queries se ejecutan en cada GET — aceptable para volumen actual.

---

## 9. Servicios consumidos cross-módulo

Ninguno cross-módulo. Solo `PrismaService` directo. **Esto es intencional** — el dashboard es punto de lectura horizontal sobre Prisma; pasar por servicios de cada módulo añadiría latencia (varios round-trips) y no aporta valor.

> **Riesgo controlado:** si las invariantes de un módulo cambian (ej. billing añade un nuevo estado de invoice), el dashboard puede mostrar stats inconsistentes hasta que se actualice manualmente. Mitigación: cuando se cambia un enum o tabla relevante, actualizar también el dashboard. Documentado como excepción legítima.

---

## 10. CASL — Permisos

### Subjects gestionados

| Subject | Descripción |
|---------|-------------|
| `Subject.Dashboard` | Acceso al overview |

### Permisos por rol

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| `Dashboard` | manage | manage | manage | manage | manage | manage |

> **Todos los roles tienen acceso** — el dashboard es el "hogar" del usuario tras login. La diferenciación está en QUÉ datos ve cada rol, no en SI puede entrar.

### Diferenciación por rol (datos mostrados)

| Rol | Ve en overview |
|-----|----------------|
| `superadmin`, `agent_full` | Stats globales: usuarios, revenue, pendientes, conversaciones, tareas asignadas a mí |
| `agent_billing` | Stats de billing + tareas mías. Sin support stats. |
| `agent_support` | Stats de support + tareas mías. Sin billing detail. |
| `client` | Mis facturas, mis servicios, mis conversaciones, mis acciones rápidas. |
| `partner` | Stats de mis clientes referidos: comisiones acumuladas, próximas liquidaciones, conversaciones de mis clientes. |

---

## 11. Settings consumidos

Ninguno actualmente.

> Si se introduce caching de stats: `dashboard.cache_ttl_seconds` configurable.

---

## 12. Emails enviados

Ninguno.

---

## 13. Jobs / cron

Ninguno.

---

## 14. Invariantes

- **DASH-INV-1:** El overview siempre devuelve datos del usuario actual (filtrado por `req.user.id` cuando aplica). Nunca hay leak de datos entre roles.
- **DASH-INV-2:** Las queries Prisma usan `select` específico — NO se trae el objeto completo de las tablas. Si una tabla añade columnas sensibles, no se exponen accidentalmente.
- **DASH-INV-3:** El dashboard es solo lectura. Cualquier acción (crear factura, abrir chat, etc.) se hace via los módulos correspondientes — el dashboard solo enlaza.

---

## 15. Decisiones relacionadas

> Migrar a ADRs en F2.

- `DECISIONS.md` §3 — Dashboard role-aware: cada rol su overview
- `DECISIONS.md` §4 — Patrón aggregator legítimo (vs microservicio estricto)

---

## 16. Excepciones documentadas

- **R1 (módulos no se llaman):** ✅ cumplido en sentido estricto. La lectura cross-módulo a Prisma es **el patrón aggregator**, documentado como excepción legítima en `_matrix.md`.
- **R5 (no lógica en frontend):** ✅ todas las stats vienen del backend. Frontend solo formatea.
- **R15:** ✅ post-refactor Sprint 7.R15.1.

---

## 17. Pendiente / deuda técnica

- [ ] Considerar caching de stats con TTL bajo (~30s) cuando el volumen crezca. Hoy las queries se ejecutan en cada GET.
- [ ] Tests E2E del overview por cada rol (verificar data isolation)
- [ ] Documentar formalmente qué stats ve cada rol (matriz exhaustiva) — útil para diseñadores y testers

---

## 18. Cómo testear este módulo

### Tests E2E
Pendiente. Crítico verificar:
- Cliente NO ve revenue total ni stats globales
- Agente NO ve datos de otros agentes
- Partner solo ve datos de sus clientes referidos

### Tests unitarios
Pendiente. Lógica de filtrado por rol en `DashboardService.getOverview()`.

### Smoke test manual
1. Login como superadmin → ver stats globales
2. Logout, login como cliente → ver SOLO mis facturas/servicios/conversaciones
3. Logout, login como partner → ver SOLO clientes asociados a mí (cuando módulo partner exista)
4. Crear nueva conversación → volver al overview → contador actualizado tras refresh

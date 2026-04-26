# ADR-060 — Decisiones pre-schema (perfiles fiscales, sesiones activas, retención de notificaciones)

> **Status:** Active
> **Date:** 2026-04 (ronda final pre-schema) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §34
> **Domain:** cross-cutting

---

## Contexto

Justo antes de cerrar el schema inicial de la base de datos (Sprint 1), surgieron tres decisiones sueltas que **afectan al modelo de datos** pero no encajaban en ninguno de los ADRs temáticos existentes:

1. **Perfiles fiscales del cliente** — un mismo cliente puede facturar como personal, autónomo y empresa simultáneamente. ¿Una tabla? ¿Tres? ¿Campos en `users`?
2. **Sesiones activas** — ¿se guarda histórico de sesiones (login/logout para auditoría) o solo las activas?
3. **Retención de notificaciones internas** — ¿cuánto tiempo se conserva una notificación leída?

Estas tres decisiones, aunque pequeñas, **bloqueaban el cierre del schema**. Se agruparon como "últimas decisiones antes del schema" en el documento original. Este ADR las consolida formalmente.

---

## Decisión

### A. Perfiles fiscales del cliente (3 tipos simultáneos)

Un cliente puede tener **tres tipos de perfil** que coexisten en su cuenta — el cliente elige cuál usar al generar una factura concreta:

```
PERFIL PERSONAL
  Nombre · apellidos · dirección · país
  NIF: opcional → genera factura simplificada si no hay NIF

PERFIL AUTÓNOMO
  Nombre · apellidos · dirección · país
  NIF: obligatorio → genera factura completa

PERFIL EMPRESA
  Razón social · dirección fiscal · país
  CIF: obligatorio → genera factura completa
```

**Modelo de datos:** tabla `client_billing_profiles` con FK a `users`, campo `profile_type ∈ {personal, autonomo, empresa}`. Un cliente puede tener varias filas (max 3, una por tipo). Al generar factura, el cliente elige `billing_profile_id`.

**Validación:**
- Si `profile_type = autonomo` o `empresa` → `nif`/`cif` obligatorio.
- Si `profile_type = personal` y NIF ausente → factura emitida como **simplificada** (RD 1619/2012).

### B. Sesiones activas — solo las vivas, sin histórico

```
- Se guardan SOLO las sesiones activas (abiertas en este momento).
- Al cerrar sesión o al expirar → el registro se ELIMINA.
- NO hay historial de sesiones pasadas.
- El cliente puede cerrar todas sus sesiones activas desde su cuenta
  ("Cerrar sesión en todos los dispositivos").
- El superadmin puede cerrar sesiones activas de cualquier usuario
  (cliente o agente).
```

**Modelo:** tabla `sessions` con `id, user_id, token_hash (SHA-256), device_info, ip, created_at, expires_at`. **Sin** `closed_at` ni `revoked_at` — al cerrar, se borra la fila.

**Razonamiento:**
- **Histórico de logins** se trackea separadamente en `audit_access_log` (R3, ADR-017) — append-only.
- **Sesiones activas** son estado operativo, no histórico — tenerlas como append-only inflaría la tabla sin valor.
- **"Cerrar sesión en todos los dispositivos"** = `DELETE FROM sessions WHERE user_id = $1`. Atómico, simple.

### C. Retención de notificaciones internas — 90 días + paginación

```
- Las notificaciones LEÍDAS se conservan 90 días. Configurable en settings.
- Después de 90 días → borrado automático via cron diario.
- En el historial se muestran máximo las últimas 50 notificaciones.
- Botón "Ver más" para cargar más sin mostrar todo de golpe.
- Notificaciones NO leídas no se borran automáticamente
  (se conservan hasta que el usuario las marque como leídas o las borre manualmente).
```

**Modelo:** tabla `notifications` con `id, user_id, event_type, payload (jsonb), status (unread|read), created_at, read_at`. Cron diario: `DELETE FROM notifications WHERE status = 'read' AND read_at < NOW() - INTERVAL '90 days'`.

**Configurable** vía settings (ADR-044): `notifications.retention_days` (default 90). Si se baja a 30, el cron borra las leídas tras 30 días.

### Por qué estas tres juntas

Las tres comparten dos características:

1. **Afectan al schema inicial** — las tres se materializan en tablas/columnas que no se podían dejar abiertas al cerrar Sprint 1.
2. **Cada una sería un mini-ADR** sin suficiente material para los 7 campos por separado. Agruparlas como "decisiones pre-schema" preserva el contexto histórico (se decidieron juntas, en una sesión final antes del cierre del schema) y evita inflar el catálogo con ADRs de 50 líneas.

---

## Consecuencias

- ✅ **Ganamos:**
  - **Schema cerrado** sin decisiones pendientes que retrasaran Sprint 1.
  - **Perfiles fiscales múltiples** soportan casos reales (cliente con cuenta personal y empresa, particular que también factura como autónomo).
  - **Sesiones limpias** — tabla pequeña, queries rápidas, modelo simple.
  - **Notificaciones acotadas** — la tabla no crece indefinidamente.
- ⚠️ **Aceptamos:**
  - **Sin histórico de sesiones** — para investigar "¿cuándo se logueó este usuario por última vez?" → consultar `audit_access_log`. Mitigación: aceptable, separación de responsabilidades.
  - **90 días de notificaciones** puede ser insuficiente para algún cliente que quiera ver más atrás. Mitigación: configurable; alternativa, "marcar como no leída" para preservar.
  - **Tres perfiles por cliente** introduce UX para elegir cuál usar al facturar — pequeña fricción adicional al checkout. Mitigación: por defecto, el último usado; UI clara.
  - **ADR consolidado** — las tres decisiones quedan en un solo documento. Si una de ellas necesita evolucionar significativamente, **se separa en ADR propio** (ej: ADR-061 "Histórico de sesiones extendido para compliance").
- 🚪 **Cierra:**
  - **No `closed_at` en `sessions`** — eliminar al cerrar.
  - **No notificaciones eternas** — borrado automático tras retención configurada.
  - **No mezclar perfiles fiscales en un solo objeto** — cada uno es una fila distinta con tipo claro.

---

## Cuándo revisar

- Si surge requerimiento de **histórico de sesiones** (compliance, investigación de incidentes) → separar en ADR nuevo y migrar a tabla append-only.
- Si los clientes piden **retención de notificaciones más larga** (1 año, indefinida) → revisar — mover a tier de plan (ej: Support Inside conserva 1 año) o ajustar default.
- Si surge un **cuarto tipo de perfil fiscal** (asociación, fundación, autónomo societario) → ampliar enum `profile_type` con ADR.
- Si Aelium opera fuera de España → reglas fiscales pueden requerir más perfiles o validaciones distintas.

---

## Referencias

- **Módulos afectados:** clients (perfiles fiscales), auth (sesiones), notifications (retención).
- **Reglas relacionadas:** R3 (audit log inmutable — separa histórico de operativo), R12 (sesiones con token hashado — SHA-256), R8 (Outbox no aplica aquí — son operaciones síncronas simples).
- **ADRs relacionados:** ADR-012 (PBAC con CASL — sesiones validan permisos), ADR-017 (audit log inmutable — histórico de accesos vive aquí, no en `sessions`), ADR-025 (numeración facturas — perfil elegido determina si factura es completa o simplificada), ADR-027 (IVA por país — perfil dicta si aplica IVA), ADR-042 (notifications — retención configurable aquí), ADR-044 (settings — `notifications.retention_days`), ADR-045 (ficha del cliente — muestra perfiles).
- **Glosario:** [Perfil fiscal](../00-foundations/glossary.md), [Sesión activa](../00-foundations/glossary.md), [Factura simplificada](../00-foundations/glossary.md).
- **Implementación:** schema en `backend/prisma/schema.prisma` (tablas `client_billing_profiles`, `sessions`, `notifications`).

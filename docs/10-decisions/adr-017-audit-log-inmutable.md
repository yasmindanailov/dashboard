# ADR-017 — Audit log inmutable

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §13 + Regla R3
> **Domain:** auth, audit, security, legal

---

## Contexto

Aelium maneja datos personales (RGPD, ADR-010) y financieros (facturas, retención 10 años). Ante:

1. **Inspección AEPD:** debe poder demostrar **quién accedió a qué datos personales y cuándo**.
2. **Disputa con un cliente:** "alguien cambió mi dirección fiscal" → evidencia inmutable de quién/cuándo.
3. **Investigación interna:** "un agente accedió a la ficha de un cliente fuera de horario" → auditable.
4. **Compromiso de cuenta:** si un agente filtra datos, hay que reconstruir el alcance.

El sistema necesita un **audit log** que cumpla:

- **Inmutable:** ni el superadmin puede borrarlo o modificarlo. Si fuera mutable, un agente comprometido podría borrar su propio rastro.
- **Completo:** registra accesos (lecturas) y cambios (escrituras) sobre datos personales y operaciones críticas.
- **Granular:** captura quién, qué, cuándo, desde qué origen (UI directa, vía ticket, vía tarea).
- **Visible al cliente:** el cliente puede ver en su portal de transparencia quién accedió a sus datos.

---

## Opciones consideradas

1. **Logs aplicación + agregador (Pino → Loki / Elasticsearch).**
   - Pros: ya existe la infraestructura de logs.
   - Contras: los logs son mutables (rotación, filtros, borrado por administrador del agregador). No cumplen "inmutable".

2. **Append-only blockchain interno.**
   - Pros: máxima inmutabilidad criptográfica.
   - Contras: overkill, complejo de operar, no aporta vs Postgres con permisos correctos.

3. **(Elegida)** **Tablas Postgres dedicadas con permisos restringidos a INSERT.**
   - Pros: usa el stack existente. Postgres garantiza permisos a nivel de role de DB. Fácil de auditar.
   - Contras: el operador de la DB con privilegios root puede técnicamente saltarse esto. Mitigación: monitoring de cambios al rol de DB.

---

## Decisión

### Tablas dedicadas (schema separado o convención de naming)

| Tabla | Captura | Cuándo |
|-------|---------|--------|
| `audit_access_log` | Lecturas de recursos sensibles | Acceso a ficha cliente, descarga de PDF de factura, lectura de conversación |
| `audit_change_log` | Cambios en recursos sensibles | Update de ficha cliente, cambio de password, cambio de email, cambio de billing profile |
| `audit_integration_log` | Datos enviados a integraciones externas | Datos enviados a Stripe, Sentry, ResellerClub, etc. |
| `audit_service_log` | Eventos específicos por producto contratado | "agente accedió al servidor del cliente", "contenedor actualizado", custom events por tipo de producto |

### Reglas (Regla R3)

1. **Solo INSERT.** Las tablas tienen privilegios SQL **explícitamente restringidos** a UPDATE y DELETE. Ni el superadmin de la app tiene permisos. Solo INSERT desde la app.
2. **Retención: 2 años.** Cron diario que borra registros más antiguos. Es la **única** operación de DELETE permitida, y se ejecuta por un job de DB con privilegios elevados, no desde la app — separación de roles.
3. **Schema separado** (recomendado): `audit.audit_access_log`, etc. Permite revocar permisos al schema completo a roles de aplicación.
4. **Estructura mínima:**
   ```
   id (UUID), timestamp, actor_id (User), actor_role,
   resource_type, resource_id,
   action ('read', 'create', 'update', 'delete'),
   correlation_id (R9), ip, user_agent,
   metadata (JSONB para campos específicos por evento)
   ```
5. **El campo `metadata` es JSON libre** — cada tipo de evento define sus campos. Para `audit_service_log`, el tipo de producto define qué eventos genera y qué campos lleva (ver §13 original / ADR-019).

### Quién puede leer el audit log

- **Superadmin:** todo (UI de admin → audit explorer).
- **Cliente en su portal de transparencia:** solo accesos a SUS datos (filtrado por `resource_id` o por `actor_id` cuando aplique). Ve el nombre real del agente + rol.
- **Otros agentes:** acceso limitado solo a su propio ámbito (caso edge — hoy no implementado, pendiente).

### Audit log del servicio (por producto)

Tabla `audit_service_log` adicional. Cada tipo de producto define sus eventos al crearse en el catálogo. Ejemplo:

```
Producto: Cloud Office (Nextcloud)
Eventos:
  contenedor_actualizado:
    descripcion_cliente: "Tu servicio fue actualizado"
    campos: { version_anterior, version_nueva }
  acceso_agente:
    descripcion_cliente: "Un agente de Aelium accedió"
    campos: { agente_nombre, agente_rol, nota, tarea_id }
```

Esto permite añadir productos nuevos sin modificar el schema — solo definir sus eventos en `products.audit_event_types` (JSONB).

---

## Consecuencias

- ✅ **Ganamos:**
  - Inmutabilidad real a nivel BD (permisos restringidos).
  - Cumplimiento RGPD / Hacienda demostrable.
  - El cliente VE quién accedió → diferenciador positivo.
  - Auditoría tras incidente: alcance reconstruible.
- ⚠️ **Aceptamos:**
  - **Permisos a nivel BD requieren disciplina operacional.** Si el rol de DB de la app tiene permisos UPDATE/DELETE (mal configurado), la inmutabilidad se rompe. Mitigación: setup de permisos como parte del init de DB, documentado.
  - Crecimiento de tablas: a 2 años de retención, pueden crecer mucho. Particionado por mes futuro si la DB sufre.
  - El audit log NO captura todo automáticamente: cada lectura/escritura sensible debe escribir explícitamente en la tabla. Olvidar hacerlo = lectura no auditada. Mitigación: Prisma middleware que automatice ciertos casos.
- 🚪 **Cierra:**
  - **No audit log mutable.** Ningún caso justifica edit/delete.
  - **No retener menos de 2 años.** Cuando sea revisado, solo se puede aumentar la retención, no reducirla.

---

## Cuándo revisar

- Si la AEPD publica directrices nuevas que cambien retención obligatoria de logs de acceso.
- Si las tablas crecen a un punto que afecta rendimiento (>100GB, miles de millones de filas) → particionado o cold storage.
- Si surge necesidad de exportar audit logs a sistema SIEM externo (caso de auditoría externa anual).

---

## Referencias

- **Módulos afectados:** todos los que escriben/leen datos sensibles. Especialmente `auth`, `clients`, `billing`, `support`.
- **Reglas relacionadas:** R3 (audit inmutable), R7 (errores notificados — al superadmin si alguien intenta UPDATE/DELETE).
- **ADRs relacionados:** ADR-010 (RGPD), ADR-018 (catálogo de productos define eventos), ADR-007 (correlation IDs).
- **Glosario:** [Audit log](../00-foundations/glossary.md), [Correlation ID](../00-foundations/glossary.md).
- **Implementación pendiente:** `AuditService` centralizado (hoy escritura directa desde auth y billing — deuda menor documentada en `_matrix.md` A2).

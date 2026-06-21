# &lt;Módulo&gt; — Contract

> Plantilla canónica. Copiar este archivo a `docs/20-modules/<modulo>/contract.md` y rellenar.
> Toda sección con contenido real; si no aplica, escribir explícitamente "N/A — razón".

---

## 1. Propósito

> Una frase. Si no se puede explicar el módulo en una frase, está mal definido.

Ejemplo: "Gestiona el ciclo de vida de las facturas, desde su creación hasta el cobro o cancelación, garantizando los invariantes legales españoles (numeración secuencial sin saltos, retención 10 años)."

---

## 2. Estado de implementación

| Estado | Descripción |
|--------|-------------|
| ✅ Producción | Módulo completo y en uso |
| 🟡 Parcial | Funcionalidad principal hecha; subfeatures pendientes (listar) |
| 🟠 WIP | En desarrollo activo, no listo para producción |
| ⬜ Stub | Solo esqueleto, sin lógica real |

> Indicar también: ¿desde qué Sprint? ¿qué Sprint cierra el último gap?

---

## 3. Modelos Prisma propios

Tablas que este módulo posee y gestiona. Otros módulos NO escriben en ellas (solo leen, idealmente vía servicio).

| Tabla | Descripción | Invariantes destacadas |
|-------|-------------|------------------------|
| `tabla_a` | descripción 1-línea | "Nunca se elimina, solo cambia estado" |
| `tabla_b` | … | … |

---

## 4. Modelos foráneos accedidos

Tablas de OTROS módulos a las que este accede.

| Tabla | Módulo dueño | Tipo de acceso | Razón | ¿Pendiente refactor? |
|-------|--------------|----------------|-------|----------------------|
| `users` | auth | lectura | Validar existencia / obtener email | No (lectura legítima) |
| `services` | billing | lectura/escritura | … | Sí (debería pasar por BillingService) |

> Si todos los accesos son legítimos, indicarlo. Si hay deuda, listarla con plan de resolución.

---

## 5. API REST expuesta

| Método | Ruta | Descripción | Auth | CASL |
|--------|------|-------------|------|------|
| GET | `/api/v1/<modulo>/...` | Listar X | JWT | `Action.List` + `Subject.X` |
| POST | `/api/v1/<modulo>/...` | Crear X | JWT | `Action.Create` + `Subject.X` |
| ... | ... | ... | ... | ... |

> Para data isolation por rol (ej. cliente solo ve lo suyo), indicarlo en una columna o nota al pie.

---

## 6. WebSocket gateway (si aplica)

Si el módulo NO tiene gateway, escribir "N/A".

### Namespace
`/<namespace>` (ej: `/support`)

### Auth
Cómo valida la conexión: JWT, guest token, header concreto, etc.

### Eventos cliente → servidor
| Evento | Payload | Permisos | Descripción |
|--------|---------|----------|-------------|
| `evento:nombre` | `{ field1, field2 }` | rol X | Qué hace |

### Eventos servidor → cliente
| Evento | Payload | Cuándo se emite |
|--------|---------|-----------------|
| `evento:nombre` | `{ ... }` | Tras procesar X |

---

## 7. Eventos emitidos

> **Cita el catálogo único:** ver detalles en [`_events.md`](_events.md). Aquí solo lista de nombres + cuándo.

| Evento | Cuándo se emite | Outbox? |
|--------|-----------------|---------|
| `<modulo>.<accion>` | Descripción del trigger | Sí / No |

> Si un evento debería usar Outbox (R8) y no lo hace, marcarlo como deuda.

---

## 8. Eventos consumidos

| Evento | Origen | Qué hace al recibirlo |
|--------|--------|----------------------|
| `<otro>.<accion>` | módulo X | Resumen de la reacción |

---

## 9. Servicios consumidos (cross-módulo)

> **Por defecto debería ser una lista vacía** — Regla R1 prohíbe llamadas directas entre módulos.
> Si hay servicios listados aquí, deben justificarse como excepciones legítimas (ej. sub-services del mismo dominio por R15).

| Servicio | De módulo | Razón legítima |
|----------|-----------|----------------|
| (ninguno) | — | — |

---

## 10. CASL — Permisos

### Subjects gestionados por este módulo

| Subject | Descripción |
|---------|-------------|
| `Subject.X` | … |

### Permisos por rol

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| Subject.X | manage | manage | read | — | read (own) | — |

> Si hay condiciones (ej. `client` solo ve `user_id = $self`), indicarlo.

---

## 11. Settings consumidos

| Categoría | Key | Default | Para qué |
|-----------|-----|---------|----------|
| `<categoria>` | `<key>` | `<valor>` | Descripción 1-línea |

> Si el módulo no consume settings, escribir "Ninguno".

---

## 12. Emails enviados

| Trigger | Plantilla | Subject | Destinatario |
|---------|-----------|---------|--------------|
| Evento o acción | función / archivo | "Subject del email" | client / agent / superadmin |

> Si no envía emails, escribir "Ninguno".

---

## 13. Jobs / cron / scheduled tasks

| Cron | Método | Qué hace |
|------|--------|----------|
| `EVERY_DAY_AT_2AM` | `MyWorker.method()` | Descripción 1-línea |

> Si no tiene jobs ni crons, escribir "Ninguno".

---

## 14. Invariantes (cosas que NUNCA pueden romperse)

> Esta sección es la más importante. Lista cada regla de negocio o legal que el módulo garantiza siempre.

- **INV-1:** Una factura nunca se elimina, solo cambia de estado a `cancelled`. (Hacienda España, art. 8 RD 1619/2012).
- **INV-2:** La numeración secuencial no admite saltos. Cada año reinicia con `AEL-YYYY-00001`.
- **INV-3:** El IVA aplicado se congela al finalizar la factura, no se recalcula tras cambios de configuración.

> Las invariantes son la "memoria del por qué". Cuando alguien proponga "y si simplemente borramos la factura...", esta sección lo bloquea.

---

## 15. Decisiones relacionadas

> Referencias a ADRs (cuando F2 se ejecute) o secciones de `DECISIONS.md`.

- ADR-NNN — <título> (futuro)
- `DECISIONS.md` §12 — Numeración secuencial de facturas
- `DECISIONS.md` §32 — Estrategia de IVA por país

---

## 16. Excepciones documentadas

> Si hay desviaciones legítimas de R1-R16, listarlas aquí.

- **R1 (módulos no se llaman):** N/A — todo cumple.
- **R8 (outbox para eventos críticos):** ⚠️ Eventos `invoice.*` deberían usar outbox y NO lo hacen. Deuda técnica documentada.
- **R15 (límite 300 líneas):** N/A — todos los archivos están dentro del límite tras refactor de Sprint X.

---

## 17. Pendiente / deuda técnica

> Lista de items conocidos no resueltos todavía. Para que cualquier nuevo dev sepa qué falta.

- [ ] Migrar emails de soporte de HTML inline a templates separados (siguiendo patrón de auth)
- [ ] Implementar outbox pattern para `invoice.*` (R8)
- [ ] Validar que `assigned_to` existe en User antes de aceptar (Tasks: pendiente)

---

## 18. Cómo testear este módulo

> Brief sobre tests existentes y cómo añadir nuevos.

- **Tests E2E:** `tests/e2e/<modulo>.spec.ts` (si existen)
- **Tests unitarios:** `backend/src/modules/<modulo>/*.spec.ts` (cuando se implementen)
- **Smoke test manual:** descripción del flujo crítico para validar a ojo

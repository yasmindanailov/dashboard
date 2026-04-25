# clients — Contract

## 1. Propósito

CRM de clientes. Ofrece la ficha completa del cliente (datos personales, contacto, perfiles fiscales para facturación, notas internas estructuradas e histórico de servicios y facturas). Distingue entre `User` (entidad fundacional de auth) y `ClientProfile` (datos de cliente como CRM). Crea automáticamente un `ClientProfile` al registrarse un user con rol `client` (Sprint 4.0b).

---

## 2. Estado de implementación

✅ **Producción.** Sprint 4 cerrado.

Pendiente menor:
- Validar filtro `role.slug = 'client'` en listings (deuda A1 de matrix)
- Tab "Soporte" en ficha del cliente con lista de chats/tickets (Sprint 7.H15 — implementado)

---

## 3. Modelos Prisma propios

| Tabla | Descripción | Invariantes destacadas |
|-------|-------------|------------------------|
| `client_profiles` | Datos extendidos de cliente (CRM) | Una fila por user con rol `client`. Auto-creada en register. |
| `billing_profiles` | Datos fiscales para facturación | Un cliente puede tener N. Solo uno marcable como `is_default`. Si NIF presente → factura completa; si no → simplificada. |
| `client_notes` | Notas estructuradas del cliente | Categorizadas: `general`, `conversation`, `solution`, `billing`, `technical`. Sync bidireccional con notas internas de support (Sprint 7.H22). |

---

## 4. Modelos foráneos accedidos

| Tabla | Módulo dueño | Tipo | Razón | Estado |
|-------|--------------|------|-------|--------|
| `users` | auth | lectura completa | Listar clientes, mostrar datos básicos en ficha | ⚠️ **Deuda A1**: debería filtrar a `role.slug = 'client'` para no mezclar agentes en listings. Verificar implementación. |
| `invoices` | billing | lectura | Tab "Facturas" en ficha del cliente, vía `ClientsBillingService` | ✅ Lectura legítima |

---

## 5. API REST expuesta

Prefix: `/api/v1/clients`. JWT auth en todos.

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `GET` | `/clients` | Listar (paginated) | `List.Client` |
| `GET` | `/clients/:id` | Ficha completa (perfil + servicios + facturas + notas) | `Read.Client` |
| `PATCH` | `/clients/:id` | Actualizar perfil | `Update.Client` |
| `POST` | `/clients/:id/notes` | Crear nota legacy (deprecated, ahora structured-notes) | `Create.ClientNote` |
| `GET` | `/clients/:id/structured-notes` | Listar notas con filtros (categoría, pinneada) | `Read.ClientNote` |
| `POST` | `/clients/:id/structured-notes` | Crear nota estructurada | `Create.ClientNote` |
| `PATCH` | `/clients/notes/:noteId/pin` | Toggle pin de nota | `Update.ClientNote` |
| `GET` | `/clients/:id/billing-profiles` | Listar perfiles fiscales del cliente | `Read.BillingProfile` + ownership |
| `POST` | `/clients/:id/billing-profiles` | Crear perfil fiscal | `Create.BillingProfile` |
| `PATCH` | `/clients/:id/billing-profiles/:profileId` | Actualizar perfil fiscal | `Update.BillingProfile` |
| `DELETE` | `/clients/:id/billing-profiles/:profileId` | Eliminar perfil | `Delete.BillingProfile` |
| `PATCH` | `/clients/:id/billing-profiles/:profileId/default` | Marcar como default | `Update.BillingProfile` |

---

## 6. WebSocket gateway

N/A — clients no tiene gateway. Los datos se actualizan vía REST.

---

## 7. Eventos emitidos

Ninguno actualmente.

> Candidatos futuros: `client.profile_updated`, `client.note_added` (cuando el módulo `audit` los necesite).

---

## 8. Eventos consumidos

Ninguno directamente.

> El listener `client_notes_sync` (cuando exista como módulo aparte) podría consumir `message.created` con `is_internal: true` para crear automáticamente una `ClientNote` categoría `conversation`. **Hoy esta sincronización vive en `support-message.service.ts`** que escribe directo en `client_notes` (excepción documentada en `support/contract.md`).

---

## 9. Servicios consumidos cross-módulo

Ninguno cross-módulo. Sub-services internos (R15):

- `ClientsService` (fachada)
- `ClientsBillingService` — lectura de invoices del cliente para tab "Facturas"

---

## 10. CASL — Permisos

### Subjects gestionados

| Subject | Descripción |
|---------|-------------|
| `Subject.Client` | Cliente (user con rol client + ClientProfile) |
| `Subject.ClientNote` | Notas estructuradas |
| `Subject.BillingProfile` | Perfiles fiscales (técnicamente shared con billing por uso) |

### Permisos por rol

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| `Client` | manage | manage | manage | read/list | — | read/list (partner-scoped) |
| `ClientNote` | manage | manage | manage | create/read | — | create/read/list (partner-scoped) |
| `BillingProfile` | manage | manage | manage | read/list | manage (own) | — |

---

## 11. Settings consumidos

Ninguno actualmente. Settings huérfanos detectados con potencial uso aquí:
- `general.default_currency` — para defaults en BillingProfile (no usado todavía)

---

## 12. Emails enviados

Ninguno directamente. Las notificaciones a cliente se envían desde otros módulos (auth, billing, support) que conocen al `User`.

---

## 13. Jobs / cron

Ninguno.

---

## 14. Invariantes

- **CLI-INV-1:** Un `ClientProfile` se crea automáticamente al registrar un user con rol `client` (Sprint 4.0b). No se crean clientes "huérfanos" sin user.
- **CLI-INV-2:** Solo un `BillingProfile` por cliente puede tener `is_default = true`. Cambiar default desmarca el anterior en transacción.
- **CLI-INV-3:** Las `ClientNote` con `pinned = true` aparecen primero en listings, ordenadas por fecha desc. Hasta 3 pinneadas visibles a la vez es lo recomendado (no enforzado).
- **CLI-INV-4:** Las notas categoría `conversation` se generan automáticamente al añadir nota interna en una conversación de soporte. Tienen referencia al `conversation_id` origen (Sprint 7.H22).
- **CLI-INV-5:** Eliminar `BillingProfile` es bloqueado si está vinculado a facturas pasadas (`Invoice.billing_profile_id`). En su lugar se marca como inactive (futuro: añadir flag `archived`).

---

## 15. Decisiones relacionadas

> Migrar a ADRs en F2.

- `DECISIONS.md` §13 — CRM ligero: ClientProfile como extensión, no reemplazo de User
- `DECISIONS.md` §15 — BillingProfile separado para datos fiscales (factura simplificada vs completa)
- `DECISIONS.md` §41 — Notas estructuradas del cliente (categorías, pin, autor)

---

## 16. Excepciones documentadas

- **R1 (módulos no se llaman):** ✅ cumplido. Lectura cross-módulo a `users` legítima (un cliente ES un user).
- **R15:** ✅ archivos dentro de límite tras Sprint 7.R15.7 (`clients/[id]/page.tsx`: 683 → 243 líneas; tabs extraídos).
- **D1, D10:** ✅ Design System aplicado en ficha (tabs, perfil, secciones).

---

## 17. Pendiente / deuda técnica

- [ ] Verificar filtro `role.slug = 'client'` en `ClientsService.findAll()` — deuda A1 de matrix
- [ ] Considerar añadir `archived` flag a `BillingProfile` para soft-delete cuando hay invoices vinculadas
- [ ] Auditar: ¿`client.profile_updated` event útil para audit module futuro?
- [ ] Refactor del sync con `client_notes`: que `support` invoque `ClientNoteService.create()` en lugar de escribir directo (mejora R1)

---

## 18. Cómo testear este módulo

### Tests E2E existentes
Cubierto indirectamente por:
- `auth.spec.ts` — al registrar un cliente, se crea `ClientProfile` (CLI-INV-1)
- Listings de billing usan `clients` para mostrar nombres de cliente

### Tests unitarios
Pendiente. Críticos:
- `ClientsService.findAll()` — verificar filtro de roles
- BillingProfile: validación de un solo default
- ClientNote: ordenamiento por pin + fecha

### Smoke test manual
1. Registrar cliente nuevo → verificar que aparece en `/dashboard/clients`
2. Abrir ficha → tabs (Perfil, Servicios, Facturas, Soporte, Notas) cargan
3. Crear billing profile con NIF → marcar como default → crear otro sin NIF
4. Crear factura para el cliente desde checkout admin → verificar que usa el billing profile default
5. Crear nota interna en chat de soporte → verificar que aparece en tab "Notas" del cliente con categoría `conversation`

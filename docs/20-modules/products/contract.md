# products — Contract

## 1. Propósito

Catálogo de lo que Aelium vende. Gestiona el ciclo de vida de productos (alta, edición, activar/desactivar, eliminar), sus planes de pricing por ciclo de cobro (mensual / anual / etc.), extras opcionales o obligatorios (ej: dominio gratis con plan anual), checklist items para servicios manuales, y categorías para organización del catálogo.

Es el módulo más **autocontenido** del sistema: cero eventos emitidos, cero eventos consumidos, cero acceso a tablas foráneas. Otros módulos (billing, dashboard) le LEEN; products no depende de nadie.

> Cada producto declara `provisioner_slug` (ej. `docker_engine`, `enhance_cp`, `resellerclub`, `internal`, `manual`). El módulo `provisioning` (Sprint 11) lo lee para invocar el plugin correcto durante el ciclo de vida del servicio. La interfaz canónica del plugin está definida en [ADR-021](../../10-decisions/adr-021-provisioners.md) y extendida en [ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md) (`getServiceInfo` + `getSsoUrl` + `executeAction`). La página del cliente `/dashboard/services/[id]` es **única para todos los plugins** y se condiciona por las `capabilities` que cada plugin reporta.

---

## 2. Estado de implementación

✅ **Producción.** Sprint 5 cerrado, hardening EC-1..EC-6 aplicado.

Pendiente menor:
- UI para campo `features` (JSON) del producto — EC-10 (Sprint 8)
- Validar restricción de `we_do_it` addon: solo vinculable a `hosting_web` y `docker_service` — EC-5.4 (Sprint 8)
- Promociones / códigos de descuento (Subjects CASL definidos pero no implementados)

---

## 3. Modelos Prisma propios

| Tabla | Descripción | Invariantes destacadas |
|-------|-------------|------------------------|
| `products` | Catálogo. Tipo (`hosting_web`, `docker_service`, etc.), precio base, configuración. | `slug` único; `type` inmutable tras creación (EC-2); flags (`is_addon`, `is_global_addon`, `requires_existing_product`) inmutables auto-set por tipo (EC-4). |
| `product_pricing` | Planes con ciclo de cobro y descuentos | Único por (product_id, billing_cycle) (EC-5); el último activo no eliminable (EC-3). |
| `product_categories` | Categorías para organización (jerárquicas) | Soft hierarchy via `parent_id`. |
| `product_extras` | Extras opcionales/obligatorios vinculables | Pueden tener su propio pricing o ser gratis con cierto plan. |
| `product_checklist_items` | Items de checklist para servicios manuales | Asociados a productos `manual` / `custom_service`. |

---

## 4. Modelos foráneos accedidos

Ninguno. **Products es un módulo completamente aislado.** Solo accede a sus propias tablas vía Prisma.

---

## 5. API REST expuesta

**Split público / admin (Sprint 9.6 + ADR-066/068)**: las **lecturas** del catálogo viven en `/api/v1/products` (sin prefijo `/admin`) — endpoint público bajo CASL `Read.Product`/`List.Product`, accesible al rol cliente para futuro Sprint 18 (Landing Integration). Las **mutaciones** (CRUD producto + pricing + categorías mutaciones) viven en `/api/v1/admin/products` con triple guard (`JwtAuthGuard` + `AdminOnlyGuard` + `PoliciesGuard`).

**Multi-path con alias legacy** (ADR-068): las mutaciones también responden en `/api/v1/products/{POST|PATCH|DELETE}` con headers `Deprecation: true` + `Sunset: Wed, 31 Dec 2026 23:59:59 GMT` + `Link: </api/v1/admin/products>; rel="successor-version"`. El path legacy se elimina del array `@Controller([...])` en commit pre-deploy de Sprint 14.

NestJS desambigua por método HTTP: `GET /api/v1/products` golpea `ProductsController` (lectura pública), `POST /api/v1/products` golpea `AdminProductsController` (mutación legacy con headers). Sin colisión.

### Productos — Lectura (canónico público `/products`)

JWT auth obligatorio. CASL `Read.Product`/`List.Product`.

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `GET` | `/products` | Listar productos (filtros activos, type, etc.) | `List.Product` |
| `GET` | `/products/:id` | Detalle producto con pricing, extras, checklist | `Read.Product` |

### Productos — Mutaciones (canónico admin `/admin/products`, alias legacy `/products`)

Triple guard. CASL `Manage.Product` (sólo `superadmin` y `agent_full`).

| Método | Ruta canónica | Descripción | CASL |
|--------|--------------|-------------|------|
| `POST` | `/admin/products` | Crear producto | `Create.Product` |
| `PATCH` | `/admin/products/:id` | Actualizar producto (sin tocar `type`) | `Update.Product` |
| `PATCH` | `/admin/products/:id/status` | Toggle activo/inactivo | `Update.Product` |
| `DELETE` | `/admin/products/:id` | Eliminar producto | `Delete.Product` |

### Pricing (canónico admin `/admin/products/...`, alias legacy `/products/...`)

| Método | Ruta canónica | Descripción | CASL |
|--------|--------------|-------------|------|
| `POST` | `/admin/products/:id/pricing` | Añadir plan de pricing | `Update.Product` |
| `PATCH` | `/admin/products/pricing/:pricingId` | Editar plan | `Update.Product` |
| `DELETE` | `/admin/products/pricing/:pricingId` | Eliminar plan (no si es el último activo, EC-3) | `Update.Product` |

### Categorías

Lectura del árbol queda en el endpoint público `/products/categories/all` (cliente lo necesita en futuro catálogo). Mutaciones en `/admin/products/categories` con alias legacy.

| Método | Ruta canónica | Descripción | CASL |
|--------|--------------|-------------|------|
| `GET` | `/products/categories/all` | Árbol completo | `List.ProductCategory` |
| `POST` | `/admin/products/categories` | Crear categoría | `Create.ProductCategory` |
| `PATCH` | `/admin/products/categories/:id` | Editar categoría | `Update.ProductCategory` |
| `DELETE` | `/admin/products/categories/:id` | Eliminar categoría (si no tiene productos asignados) | `Delete.ProductCategory` |

---

## 6. WebSocket gateway

N/A — products no tiene gateway. Catálogo estático, se actualiza vía REST.

---

## 7. Eventos emitidos

Ninguno. Products es CRUD puro: cambios persisten y otros módulos los leen bajo demanda.

> **Decisión consciente:** no se emiten `product.created`, `product.updated` porque ningún consumidor los necesita hoy. Si futuras features (notificaciones a partners por nuevos productos, ej.) los requieren, se añaden entonces — no antes.

---

## 8. Eventos consumidos

Ninguno.

---

## 9. Servicios consumidos cross-módulo

Ninguno cross-módulo. Sub-services internos (R15):

- `ProductsService` (fachada)
- `ProductsCatalogService` — listado público y agrupación por categorías (uso desde billing checkout)

---

## 10. CASL — Permisos

### Subjects gestionados

| Subject | Descripción |
|---------|-------------|
| `Subject.Product` | Productos del catálogo |
| `Subject.ProductCategory` | Categorías |
| `Subject.Promotion` | (futuro) promociones |
| `Subject.DiscountCode` | (futuro) códigos de descuento |

### Permisos por rol

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| `Product` | manage | manage | — | — | read/list | — |
| `ProductCategory` | manage | manage | — | — | — | — |
| `Promotion` | manage | manage | — | — | — | — |
| `DiscountCode` | manage | manage | — | — | — | — |

> Los clientes pueden VER el catálogo (read/list) para contratar (DECISIONS.md §32). No pueden modificarlo.

---

## 11. Settings consumidos

Ninguno actualmente. El IVA y precios vienen del propio producto/pricing, no de settings globales.

---

## 12. Emails enviados

Ninguno.

---

## 13. Jobs / cron

Ninguno.

---

## 14. Invariantes

- **PROD-INV-1:** El `slug` de un producto es único globalmente. Verificado en create y update (EC-1: `ConflictException` con mensaje claro).
- **PROD-INV-2:** El `type` de un producto es inmutable tras creación (EC-2). Cambiar tipo = crear producto nuevo. Eliminado de `UpdateProductDto`.
- **PROD-INV-3:** Los flags `is_addon`, `is_global_addon`, `requires_existing_product` son auto-set por `type` y son inmutables (EC-4). No se exponen en `UpdateProductDto`.
- **PROD-INV-4:** No puede haber dos `ProductPricing` para el mismo producto con el mismo `billing_cycle` (EC-5: validación previa con `ConflictException`).
- **PROD-INV-5:** Un producto activo no puede quedarse sin `ProductPricing` (EC-3: el último plan no eliminable mientras el producto esté activo).
- **PROD-INV-6:** `partner_commission_pct` debe estar entre 0 y 100 (EC-6: `@Min(0) @Max(100)` en DTOs).
- **PROD-INV-7:** El producto `we_do_it` (addon de servicio gestionado por Aelium) solo puede vincularse a `hosting_web` y `docker_service` (EC-5.4 — pendiente de implementar).
- **PROD-INV-8:** `hosting_agency` fue eliminado del catálogo (DECISIONS Sprint 5). Partners venden los mismos planes `hosting_web` con descuento. NO recrear este tipo.

---

## 15. Decisiones relacionadas

> Migrar a ADRs en F2.

- `DECISIONS.md` §6 — Catálogo dinámico de productos (tipos, configuración, manifiest)
- `DECISIONS.md` §32 — Cliente ve catálogo en dashboard (no en landing siempre)
- Sprint 5 hardening — EC-1..EC-6 (validaciones de invariantes)

---

## 16. Excepciones documentadas

- **R1 (módulos no se llaman):** ✅ totalmente cumplido. Products es el módulo más aislado del sistema.
- **R8 (Outbox):** N/A — no emite eventos.
- **R15:** ✅ post-refactor Sprint 7.R15.8/9 (`products/page.tsx`: 323→282 líneas; `products/new/page.tsx`: 347→296 líneas).

---

## 17. Pendiente / deuda técnica

- [ ] UI para campo `features` (JSON) — EC-10 (Sprint 8)
- [ ] Validar restricción `we_do_it` addon — EC-5.4 (Sprint 8)
- [ ] Implementar Promociones y Códigos de descuento (Subjects CASL ya definidos)
- [ ] Considerar emitir `product.created` / `product.archived` cuando partners necesiten notificaciones automáticas por catálogo nuevo
- [ ] **[Sprint 8 Fase D — ADR-075]** `AdminProductsController` añade guard que rechaza `POST/PATCH/DELETE` sobre `type='support_inside'` con 400 salvo header interno `X-Aelium-Source: support-inside-admin` (sólo lo añade el cliente HTTP de la página dedicada `/admin/support-inside-plans`). Frontend filtra `support_inside` de `PRODUCT_TYPES_CREATABLE`. Listado renderiza filas `support_inside` en gris con badge "Tier de cuenta" + link a página dedicada. Doctrina canónica: Support Inside vive en `products` (ADR-034) pero se gestiona EXCLUSIVAMENTE desde su página dedicada (ADR-061 + ADR-075).

---

## 18. Cómo testear este módulo

### Tests E2E existentes
Cubierto indirectamente por `checkout-admin.spec.ts` (el checkout usa products en step 2).

### Tests unitarios
Pendiente. Críticos:
- Invariantes EC-1..EC-6 (slug único, type inmutable, etc.)
- Lógica de pricing por ciclo (no duplicados)
- Eliminación protegida del último plan activo

### Smoke test manual
1. Crear producto `hosting_web` con 3 planes (mensual, trimestral, anual con 15% descuento)
2. Editar el producto — verificar que `type` no es editable
3. Eliminar el plan anual — éxito; eliminar el último plan — bloqueo con mensaje claro
4. Crear extra `dominio gratis` vinculado al producto, activable solo con plan anual
5. Crear categoría jerárquica → asignar productos → verificar árbol

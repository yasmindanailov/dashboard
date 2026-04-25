# ADR-032 — Flujo de compra (dos procesos + tres niveles de catálogo)

> **Status:** Active
> **Date:** 2026-04 (origen Sprint 6) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §32
> **Domain:** billing, ui

---

## Contexto

Un cliente potencial puede llegar al producto desde dos contextos:

1. **Sin cuenta previa**, viniendo de la landing pública. Quiere contratar lo que vio.
2. **Con cuenta previa**, ya está dentro del dashboard. Quiere añadir un producto.

Estos contextos requieren UX distinto. Pedirle al primer caso "regístrate primero, verifica email, login, luego ve al catálogo y compra" rompe la conversión. Pedirle al segundo "rellena tus datos de facturación de nuevo" es absurdo.

Adicionalmente, el catálogo del producto se presenta en **tres profundidades distintas** según contexto: checkout transaccional, exploración detallada, marketing en landing. Si los tres consumieran datos distintos, divergirían rápido.

---

## Decisión

### Dos procesos de compra

#### Proceso 1 — Compra desde la landing (sin cuenta previa)

```
1. Visitante selecciona producto en la landing pública.
2. Clic en "Contratar".
3. Formulario único:
   - Nombre · Apellidos · Email · Contraseña
   - Dirección · País (obligatorios para factura)
   - NIF/CIF: opcional
4. Pago.
5. Cuenta creada automáticamente con rol `client` y email_verified_at = null.
6. Login automático → dashboard con producto activo / pendiente.
7. Notificación visible: "Verifica tu email" (NO bloqueante — el cliente puede usar el dashboard).
```

**Decisión consciente:** la verificación de email **no bloquea** después de comprar desde landing. El cliente acaba de pagar — bloquearle el acceso degrada la experiencia. La verificación queda como recordatorio persistente; ciertos endpoints sensibles pueden requerirla en el futuro.

#### Proceso 2 — Compra desde el dashboard (con cuenta previa)

```
1. Cliente registrado se loguea (verificación email obligatoria para login normal — ADR-013).
2. Va al catálogo (Nivel 2 — exploración).
3. Selecciona producto → checkout (Nivel 1 — transaccional).
4. Sus datos de facturación guardados aparecen seleccionables.
   - Si tiene varios `BillingProfile`, elige cuál usar para este servicio.
   - Si no tiene → se le pide crear uno antes de pagar.
5. Pago (con plugin activo — ADR-031).
6. Servicio activo (o pending si requiere provisioner).
```

### Tres niveles de catálogo — misma fuente de datos

Los tres niveles consumen la **misma API** (`/api/v1/products`) y el mismo campo `features` (JSON) del producto. Diferencia: profundidad de presentación.

#### Nivel 1 — Checkout (transaccional)

- **Ubicación:** `/dashboard/billing/checkout`
- **Para:** cliente + admin (admin checkout para crear servicio para un cliente — EC-BILL-01..03).
- **Muestra:** cards con nombre + precio mínimo → seleccionar → pagar.
- **Propósito:** comprar rápido (el usuario ya sabe lo que quiere).

> **Regla:** el checkout NUNCA muestra comparativas extensas ni tabla de features completa. Si el cliente necesita comparar, va al catálogo (Nivel 2).

#### Nivel 2 — Catálogo del dashboard (exploración)

- **Ubicación:** `/dashboard/catalog` (Sprint 13.29 — pendiente).
- **Para:** cliente.
- **Muestra:** features comparativas, tabla de planes, badges, FAQ del producto.
- **Propósito:** explorar y comparar → botón "Contratar" lleva al checkout.
- **Depende de:** Sprint 8 EC-10 (UI de campo `features` JSON — pendiente).

#### Nivel 3 — Landing pública (marketing)

- **Ubicación:** landing en `/hosting`, `/dominios`, etc. (Sprint 18 — pendiente).
- **Para:** visitante sin cuenta.
- **Muestra:** pricing tabs, comparativas visuales, CTA a "Contratar" que lleva a Proceso 1.
- **Propósito:** captar → registrar + comprar en un solo flujo.

> **Regla:** el catálogo NUNCA procesa pagos. Los tres niveles son páginas separadas con responsabilidades separadas.

### Admin checkout (caso edge — Sprint 7 hardening)

Un admin puede crear un servicio en nombre de un cliente:

- **EC-BILL-02:** UI selector de cliente — el admin selecciona qué cliente target.
- **EC-BILL-01:** validación obligatoria — el admin no puede crear servicio para sí mismo (debe seleccionar otro cliente).
- **EC-BILL-03:** el `billing_profile_id` debe pertenecer al cliente target, no al admin.
- **EC-CHKOUT-04:** descuento anual del plan se aplica correctamente al servicio + factura.

### Perfiles de facturación múltiples

Detalle en ADR-027. Resumen aquí:

- Un cliente puede tener varios `BillingProfile` (personal + autónomo + empresa).
- Define uno como predeterminado (`is_default: true`).
- Al contratar puede elegir cuál usar para ese servicio.
- El servicio se factura siempre con ese perfil; cambio futuro aplica desde la siguiente factura.

### NIF opcional — facturas simplificadas

- Sin NIF/CIF → factura simplificada.
- El cliente puede añadir NIF después → futuras facturas serán completas.
- Las anteriores **no se rectifican automáticamente**.

---

## Consecuencias

- ✅ **Ganamos:**
  - Conversión desde landing es óptima (un solo formulario, sin verificación bloqueante).
  - Cliente recurrente reutiliza datos de facturación.
  - Catálogo coherente en tres contextos sin duplicar datos.
  - Admin checkout para gestión interna.
- ⚠️ **Aceptamos:**
  - El catálogo Nivel 2 (`/dashboard/catalog`) está **pendiente** — Sprint 13.29.
  - Landing Nivel 3 está **pendiente** — Sprint 18.
  - Hoy solo el checkout transaccional (Nivel 1) existe. Los demás niveles son plan documentado.
- 🚪 **Cierra:**
  - **No mezclar checkout con exploración.** Checkout = transaccional puro.
  - **No múltiples APIs para el mismo catálogo.** Una sola fuente.

---

## Cuándo revisar

- Cuando se construya Nivel 2 (catálogo dashboard): validar que comparativa funciona con el campo `features` JSON. Si JSON resulta limitante, evaluar campos específicos.
- Cuando se construya Nivel 3 (landing): validar que el flujo unificado registro+compra preserva la conversión.
- Si surge necesidad de compras anónimas reales (sin crear cuenta) — improbable, pero requeriría ADR aparte.

---

## Referencias

- **Módulos afectados:** billing (checkout), products (catálogo), auth (registro durante compra).
- **ADRs relacionados:** ADR-018 (catálogo dinámico), ADR-026 (estados factura), ADR-027 (IVA + perfiles), ADR-031 (payment providers).
- **Edge cases:** EC-BILL-01..03, EC-CHKOUT-04 (Sprint 7 hardening).
- **Glosario:** [Servicio](../00-foundations/glossary.md), [Perfil de facturación](../00-foundations/glossary.md).
- **Implementación:** `backend/src/modules/billing/billing-checkout.service.ts`, frontend `/app/dashboard/billing/checkout/`.

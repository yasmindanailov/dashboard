# ADR-027 — IVA por país y multi-moneda preparada

> **Status:** Active
> **Date:** 2026-04 (origen Sprint 6) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §12 (parcial) + §32 (parcial)
> **Domain:** billing, legal

---

## Contexto

Aelium opera en España, donde el IVA general aplicable a servicios digitales B2C es **21%**. Pero hay matices:

- Clientes B2B con NIF/CIF español: 21% IVA con derecho a deducción del cliente.
- Clientes B2C sin NIF: 21% IVA aplicado.
- **Clientes B2B europeos con NIF intracomunitario:** facturación con IVA 0% si el cliente declara correctamente (reverse charge / inversión del sujeto pasivo).
- **Clientes B2C europeos:** régimen OSS (One Stop Shop) — IVA del país del cliente.
- **Clientes fuera de UE:** facturación sin IVA (exportación de servicios).

A día de hoy Aelium **solo factura a clientes españoles** (B2C y B2B nacionales). El sistema no debe complicarse con casos europeos hasta que sean reales. **Pero el schema debe soportarlos** para cuando lleguen.

Adicionalmente: aunque hoy Aelium solo opera en EUR, el schema debe soportar multi-moneda futura sin migración compleja.

---

## Opciones consideradas

1. **Hardcoded 21% IVA, EUR como única moneda.**
   - Pros: simplicidad máxima.
   - Contras: cuando llegue el primer cliente fuera de España, hay que migrar el schema con datos vivos. Doloroso.

2. **Schema multi-moneda + multi-IVA desde día 1, lógica completa de reverse charge / OSS implementada.**
   - Pros: futuro-proof.
   - Contras: sobreingeniería. Lógica fiscal compleja para casos que no existen.

3. **(Elegida)** **Schema preparado para multi-moneda + multi-IVA, pero lógica de aplicación restringida a 21% ES + EUR.** Cuando lleguen clientes fuera de España, la lógica se extiende sin tocar schema.
   - Pros: schema robusto sin coste de implementación de casos no usados.
   - Contras: requiere disciplina al codificar para no asumir EUR/21% en código (consultar siempre los campos de la factura/perfil).

---

## Decisión

### Schema multi-moneda

| Campo | Lugar | Default actual |
|-------|-------|----------------|
| `currency` | `Invoice` | `'EUR'` |
| `currency` | `ProductPricing` | `'EUR'` |
| Settings global | `general.default_currency` | `'EUR'` |

> Hoy todos los `currency` son `'EUR'`. Cuando se introduzca otra moneda: nueva `ProductPricing` con esa moneda + nuevo perfil de cliente que la fuerce + tasa de cambio si se reporta en EUR.

### IVA por factura

- Campo `tax_rate` en cada `Invoice` (decimal). Default `21.00`.
- Campo `tax_amount` calculado al finalize (= `subtotal × tax_rate / 100`).
- **Inmutable tras finalize** (BILL-INV-3, ADR-026).
- Campo `default_tax_rate` en settings (`billing.default_tax_rate`) — usado como default al crear factura. Configurable desde dashboard cuando exista UI de settings.

### Lógica actual (sin clientes UE)

- **Default:** 21% IVA aplicado a todas las facturas.
- **Si el cliente tiene `BillingProfile` con `country = 'ES'`:** 21% IVA.
- **Si `country` ≠ 'ES':** **rechazo de momento** (no soportado). Mensaje claro al admin si intenta crear factura para cliente de otro país.

### Factura simplificada vs completa

Determinada por presencia de NIF/CIF en el `BillingProfile` usado:

- **Sin NIF/CIF** → factura simplificada. Datos: nombre, email, dirección.
- **Con NIF/CIF** → factura completa. Obligatoria para empresas y autónomos que necesiten deducir IVA.

Modelo actual de `BillingProfile`:

| Tipo de perfil | NIF/CIF |
|----------------|---------|
| Personal | Opcional → simplificada si vacío |
| Autónomo | Obligatorio (NIF) → completa |
| Empresa | Obligatorio (CIF) → completa |

### Lógica futura (cuando aplique)

Cuando Aelium acepte clientes UE / fuera de UE:

- **B2B intracomunitario con NIF EU válido:** 0% IVA + texto legal "Operación exenta — IVA repercutido por el destinatario (art. 25 LIVA)". Validación del NIF intracomunitario via VIES.
- **B2C UE:** régimen OSS — IVA del país del cliente. Aelium debe registrar en OSS y declarar trimestralmente.
- **Fuera de UE:** 0% IVA + texto "Exportación de servicios (art. 22.cuatro LIVA)".

Esta lógica se construye cuando llegue el primer cliente real de cada categoría. **Hoy no se construye.**

---

## Consecuencias

- ✅ **Ganamos:**
  - Schema preparado para futuro sin migration compleja.
  - Cumplimiento actual con cliente español (21% / facturas simplificadas vs completas).
  - Configuración de IVA default editable sin redeploy.
- ⚠️ **Aceptamos:**
  - Sistema rechaza facturación a clientes fuera de España hasta que se construya lógica específica. Cuando llegue el primer caso → ADR nuevo + implementación.
  - El campo `currency` está pero no se ejerce. Cualquier cambio de moneda requerirá pruebas exhaustivas.
- 🚪 **Cierra:**
  - **No hardcodear 21% en código.** Siempre leer del campo `tax_rate` de la factura o `default_tax_rate` del setting.
  - **No asumir EUR.** El frontend debe formatear según `currency` de la factura, no hardcodear `€`.

---

## Cuándo revisar

- Cuando llegue el primer cliente potencial fuera de España → ADR nuevo con lógica B2B intracomunitario, OSS, exportación, según el caso.
- Cuando Hacienda actualice tipos de IVA aplicables (ej: tipo reducido para servicios digitales — improbable pero posible).
- Cuando entre en vigor algún sistema de e-factura obligatoria (Verifactu, SII, etc.).

---

## Referencias

- **Módulos afectados:** billing.
- **ADRs relacionados:** ADR-025 (numeración), ADR-026 (estados), ADR-029 (prorrateo), ADR-032 (flujo de compra y perfiles).
- **Glosario:** [Factura](../00-foundations/glossary.md), [Perfil de facturación](../00-foundations/glossary.md).
- **Implementación:** `backend/src/modules/billing/billing-calculator.service.ts:calculateTax()`, `Invoice.tax_rate`, `Invoice.currency`, `Invoice.tax_amount` en schema.
- **Edge cases:** EC-BILL-07 (recalcular IVA al editar items en draft).
- **Legal:** [Ley 37/1992 del IVA (LIVA)](https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740) — referencia general.

# ADR-054 — Sistema de referidos para clientes normales

> **Status:** Active (planificada — Sprint dedicado tras Fase 2)
> **Date:** 2026-04 · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §36 + §39 (referral credits expired)
> **Domain:** clients, billing

---

## Contexto

Aelium quiere incentivar el **boca-a-boca entre clientes normales** (no agencias partner — ese es el módulo separado, ADR-048). Cada cliente tiene un enlace de referido único; si un amigo se registra con ese enlace y contrata su primer servicio, ambos reciben un beneficio.

**Razonamiento de tener un sistema separado del partner:**
- El partner es un canal **profesional** con dashboard, comisiones por producto, payouts SEPA. Pesado y formal.
- Un cliente normal que recomienda Aelium a un amigo no necesita esa máquina — solo un enlace y un crédito mensual mientras el amigo siga activo.
- Mezclar ambos sistemas confunde el modelo (¿el cliente referidor es "mini-partner"? ¿factura comisión?).

Las opciones eran:
- **Crédito único por conversión** → cliente refiere, amigo compra, cliente recibe X€ una vez. Simple pero poco fidelizante.
- **Crédito mensual recurrente** → mientras el referido tenga servicio activo, el referidor recibe crédito mensual. Más fidelizante.
- **Comisión sobre lo facturado** → idéntico al partner, demasiado pesado para clientes normales.

Se elige la opción intermedia: **crédito mensual recurrente** mientras el referido esté activo, **descuento puntual** al referido en su primer pedido.

---

## Decisión

### Concepto

Cada cliente normal tiene un **enlace de referido único** (`referral_codes.code`). Si un amigo se registra con ese enlace y contrata su primer servicio:

- **Cliente que refiere:** crédito mensual mientras el referido mantenga servicios activos.
- **Referido:** descuento puntual en su primer pedido.

### Beneficio para el cliente que refiere

- **Crédito mensual** mientras el referido tenga al menos un producto activo.
- Importe: configurable en settings (`referrals.monthly_credit_eur`).
- El crédito se acumula cada mes en `referral_credits` (status `accrued`).
- Se aplica como **descuento en su próxima factura** automáticamente (status pasa a `applied`).
- Si el referido **cancela todos sus servicios** → el crédito mensual se detiene a partir de ese mes.
- El **crédito acumulado no se pierde** — se sigue aplicando en facturas futuras del referidor hasta agotarse.

### Beneficio para el referido

- **Descuento en su primer pedido** únicamente.
- Porcentaje: configurable en settings (`referrals.first_purchase_discount_pct`).
- Se aplica automáticamente al detectar el `referral_code` en el registro.
- Las **siguientes compras** del referido **no tienen descuento** por este motivo.

### Cuándo se activa el beneficio

```
1. Amigo se registra usando el referral_code:
   - Crear registro en referrals:
     id, referrer_id, referred_id, referral_code, status='pending', created_at
   - El cliente que refiere ve en su historial: "X se registró pero aún no ha comprado"

2. El referido realiza su PRIMERA compra:
   - status = 'active'
   - Se aplica descuento en esa primera compra (referrals.first_purchase_discount_pct)
   - Se activa el crédito mensual para el referidor (cron mensual genera referral_credits)
```

### Cron mensual

```
Cron: 1 del mes a las 04:00 UTC
  Para cada referral con status='active':
    Si el referido tiene al menos un servicio activo:
      Crear referral_credit:
        - id, referrer_id, referred_id, amount=referrals.monthly_credit_eur,
          status='accrued', accrued_at, applied_to_invoice_id=null
    Si no:
      No genera crédito (pero el registro de referral sigue active —
      si el referido vuelve a contratar, vuelven a generarse créditos)
```

### Aplicación del crédito en facturas

Al **generar una factura** para el referidor:
1. Buscar `referral_credits` con `status='accrued'` (acumulados pendientes).
2. Aplicar como descuento hasta agotar el crédito o hasta cubrir el total de la factura.
3. Marcar los créditos aplicados como `status='applied'`, `applied_to_invoice_id`.
4. Si la factura se cubre 100% con créditos: `total = 0` (no hay cobro pero la factura existe — registro fiscal).
5. Si quedan créditos sin aplicar (la factura es más pequeña): se conservan para la siguiente factura.

### Expiración de créditos (status `expired`)

- Los créditos pueden expirar si no se usan en plazo configurable.
- Default: **12 meses** (`referrals.credit_expiry_months`).
- Si `credit_expiry_months = 0` → los créditos **nunca expiran**.
- Cron: tras X meses sin aplicarse → status `expired`. No se pueden usar.

### Límite de referidos

- **Sin límite por defecto.**
- Configurable: `referrals.max_active_per_client` (0 = sin límite).
- Si se supera el límite → los nuevos `referrals` quedan en `status='blocked'` (no generan crédito).

### El partner NO tiene sistema de referidos

Los partners (ADR-048) **ya tienen comisiones por cada producto** de sus clientes. **No acumulan créditos de referido.** Son sistemas completamente separados:

- Si un cliente normal tiene `referrer_id != null` (fue referido por otro cliente) → genera créditos para el referidor.
- Si un cliente tiene `partner_id != null` (es del partner X) → genera comisión para el partner.
- **Ambos pueden coexistir** en el mismo cliente — cada uno es independiente.

### Configuración en settings (sección: Referidos)

```
referrals.monthly_credit_eur                → X€
referrals.first_purchase_discount_pct       → X%
referrals.max_active_per_client             → X (0 = sin límite)
referrals.credit_expiry_months              → 12 (0 = nunca expira)
referrals.system_active                     → true / false (toggle global)
```

### Tablas nuevas en el schema

```
referral_codes    → enlace único por cliente (1:1 con users)
referrals         → historial de referidos con su estado (pending|active|blocked|cancelled)
referral_credits  → créditos generados (accrued|applied|expired) con tracking de factura
```

### Estados de `referrals`

| Status | Significado |
|--------|-------------|
| `pending` | Referido se registró pero no ha comprado |
| `active` | Referido tiene al menos un servicio activo, genera créditos mensuales |
| `cancelled` | Referido canceló todos sus servicios (créditos dejan de generarse) |
| `blocked` | Excedió el límite de referidos por cliente |

---

## Consecuencias

- ✅ **Ganamos:**
  - Incentivo claro al boca-a-boca sin pesadez (no hay dashboard partner para clientes normales).
  - Crédito mensual recurrente fideliza al cliente referidor (mientras gane crédito, sigue eligiendo Aelium).
  - Descuento puntual al referido reduce fricción de la primera compra.
  - Sistema desacoplado del partner — no se confunden modelos.
  - Configurable globalmente (importes, límites, expiración) — Aelium ajusta según operativa.
- ⚠️ **Aceptamos:**
  - Crecimiento de `referral_credits` — un cliente popular puede acumular muchos créditos. Mitigación: aplicación automática en cada factura + expiración configurable.
  - Riesgo de **abuso** (cliente crea cuentas falsas para auto-referirse). Mitigación: validación de email único + verificación + monitoreo de patrones (IP, dispositivo).
  - **Cliente con créditos acumulados que cancela todo** — los créditos quedan huérfanos. Política: se conservan asociados al cliente; si vuelve, se aplican en facturas futuras. Si no vuelve, expiran.
  - **Sistema separado del partner** = mantenimiento de dos códigos similares. Mitigación: aceptable; los modelos son lo suficientemente distintos.
- 🚪 **Cierra:**
  - **No mezclar referidos y partner.** Un cliente con `referrer_id` no se convierte en partner; un partner no acumula créditos.
  - **No descuento de referido en facturas que no son la primera del referido.**

---

## Cuándo revisar

- Si los créditos no se gastan (la mayoría expiran) → revisar valor del crédito mensual o reducir el plazo de expiración.
- Si se detecta abuso (cuentas falsas, multi-cuenta del mismo usuario) → reforzar verificación.
- Si Aelium cambia modelo de pricing y el crédito mensual ya no encaja (ej: planes con créditos integrados) → reevaluar.
- Si surgen partners que se quejan de que sus clientes referidos no les generan comisión → aclarar contractualmente: el partner cobra comisión por sus clientes; el cliente referidor cobra crédito por sus referidos. **Pueden coexistir** en un mismo cliente final.

---

## Referencias

- **Módulos afectados:** clients (referidor + referido), billing (aplicación de créditos), users (`referrer_id` en cliente registrado via referral).
- **Reglas relacionadas:** R1 (módulos por eventos), R3 (audit log + créditos como append-only), R5 (cálculos en backend), R8 (Outbox para `referral.credit.accrued` y `referral.credit.applied` — críticos financieros).
- **ADRs relacionados:** ADR-048 (modelo partner — sistema **separado** explícitamente), ADR-023 (promociones — modelo distinto, no se solapa), ADR-027 (IVA — créditos se aplican sobre subtotal, similar a comisiones), ADR-033 (Outbox pendiente), ADR-044 (settings — configuración del sistema referidos).
- **Glosario:** [Referido](../00-foundations/glossary.md), [Crédito](../00-foundations/glossary.md), [Referrer](../00-foundations/glossary.md).
- **Implementación pendiente:** módulo `referrals` (no existe aún).

# ADR-025 — Numeración secuencial de facturas (Hacienda RD 1619/2012)

> **Status:** Active
> **Date:** 2026-04 (origen Sprint 6) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §12 (parcial)
> **Domain:** billing, legal

---

## Contexto

España regula la facturación con el **Real Decreto 1619/2012** (Reglamento por el que se regulan las obligaciones de facturación). Obligaciones críticas para Aelium:

1. **Numeración correlativa sin saltos** dentro de cada serie (art. 6.1.b).
2. **Retención mínima 4 años** (art. 19) — Aelium amplía a 10 años por margen.
3. **No alteración del documento** una vez emitido. Las facturas erróneas se **anulan con factura rectificativa**, NO se editan ni se borran.
4. **Series de numeración** permitidas si están justificadas y documentadas (ej: una serie por año).

Si la numeración salta (ej: factura `0042` seguida de `0044`, sin `0043`), una inspección puede sospechar facturas ocultas y aplicar sanciones.

Hace falta un mecanismo que **garantice numeración correlativa atómicamente**, incluso bajo concurrencia (dos facturas creadas en el mismo milisegundo no pueden compartir número ni saltarlo).

---

## Opciones consideradas

1. **Auto-increment de Postgres** sobre la columna `invoice_number`.
   - Pros: trivial.
   - Contras: si una creación de factura falla a mitad de la transacción, el número se "consume" y queda hueco. Hueco = salto. NO cumple legalmente.

2. **Contador en aplicación** (Redis incrementado al crear).
   - Pros: rápido.
   - Contras: si el commit a Postgres falla tras incrementar Redis, hueco. Más fácil de perder consistencia.

3. **(Elegida)** **Postgres SEQUENCE por año**, asignación del número solo al **finalize** (transición `draft → pending`), no al crear `draft`.
   - Pros: la SEQUENCE garantiza atomicidad. Si la creación falla antes del finalize, no se consume número. La asignación al finalize garantiza que el número se asigna solo cuando la factura se considera "emitida".
   - Contras: el `draft` no tiene `invoice_number` todavía. UI debe manejar este estado.

---

## Decisión

### Mecanismo

- **PostgreSQL SEQUENCE por año:** `invoice_number_seq_2026`, `invoice_number_seq_2027`, etc.
- Se crean automáticamente con migración + cron de "preparar año siguiente" (al final de noviembre, crear la sequence del año entrante).
- **Asignación atómica al finalize:**
  ```sql
  UPDATE invoices
  SET invoice_number = nextval('invoice_number_seq_2026'),
      status = 'pending',
      finalized_at = now()
  WHERE id = $1 AND status = 'draft';
  ```
  PostgreSQL garantiza que `nextval()` es atómico bajo concurrencia.

### Formato del número

`<PREFIJO>-<AÑO>-<NÚMERO_CON_PADDING>`

- Prefijo configurable en settings: default `AEL`.
- Año: 4 dígitos.
- Número: 5 dígitos con padding de cero (`00001`).

Ejemplo: `AEL-2026-00042`.

Sufijo opcional configurable (ej: `-S` para series especiales). No usado por defecto.

### Estados y transición de número

| Estado | Tiene número? |
|--------|---------------|
| `draft` | NO |
| `pending` | SÍ (asignado al finalize) |
| `paid` | SÍ |
| `overdue` | SÍ |
| `cancelled` | SÍ (conserva el número aunque ya no es válida) |
| `refunded` | SÍ |

### Anulación / corrección

- **Una factura `pending` o `paid` errónea NO se edita ni se borra.**
- Se cancela (`status: cancelled`). El número queda asignado pero la factura no es válida fiscalmente.
- Si hace falta emitir nueva factura → factura nueva con número nuevo.
- Si hace falta nota de abono → factura rectificativa con su propia numeración (serie distinta o misma serie con flag `is_credit_note`). **Estado actual: no implementado**, pendiente cuando aplique caso real.

### Series múltiples (futuro)

Por ahora una sola serie por año. Si en el futuro Aelium emite facturas a clientes extranjeros con tratamiento fiscal distinto → serie separada justificada documentalmente. Cambio requiere ADR nuevo.

---

## Consecuencias

- ✅ **Ganamos:**
  - Numeración legalmente correcta. Atómica bajo concurrencia.
  - Invariante BILL-INV-1 garantizada.
  - Anulación documentada (cancel, no delete).
- ⚠️ **Aceptamos:**
  - El `draft` no tiene número visible en la UI hasta finalize. UI debe distinguirlo claramente.
  - Cron de creación de SEQUENCE para año siguiente debe ejecutarse antes del 1 de enero. Si falla, las primeras facturas del nuevo año fallarían. Mitigación: la sequence se puede crear manualmente; alerta al admin si llega el 15 de diciembre y no existe la sequence del año siguiente.
  - Si una sequence se corrompe (improbable en Postgres) hay que restaurarla desde backup. Cambio difícil pero posible.
- 🚪 **Cierra:**
  - **Una factura nunca se elimina.** R3 + Hacienda. Solo cambio de estado.
  - **Una factura no se edita post-finalize.** Items y total se congelan. Editar `draft` SÍ recalcula (EC-BILL-07).

---

## Cuándo revisar

- Si Aelium emite facturas a clientes UE no españoles → considerar serie separada con tratamiento de IVA distinto (reverse charge intracomunitario).
- Si surgen regulaciones nuevas (e-factura obligatoria, B2B nacional cuando entre en vigor SII en pymes) → ADR nuevo.
- Si Hacienda actualiza RD 1619/2012 con cambios de fondo.

---

## Referencias

- **Módulos afectados:** billing.
- **Reglas relacionadas:** R3 (audit log inmutable, mismo principio aplicado a facturas), R8 (Outbox para `invoice.*` — pendiente, ADR-033).
- **ADRs relacionados:** ADR-026 (estados de factura), ADR-027 (IVA), ADR-031 (payment providers — generan `invoice.paid`).
- **Glosario:** [Factura](../00-foundations/glossary.md), [Numeración secuencial](../00-foundations/glossary.md), [Item de factura](../00-foundations/glossary.md).
- **Implementación:** `backend/src/modules/billing/billing-invoice.service.ts:finalizeInvoice()`, schema Prisma `Invoice.invoice_number` UNIQUE.
- **Legal:** [BOE — Real Decreto 1619/2012](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696).

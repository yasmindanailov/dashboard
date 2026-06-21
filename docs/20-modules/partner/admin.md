# partner — Admin operativo

> Guía operativa para administrar partners en el dashboard.
>
> **Estado actual:** módulo no implementado todavía. Esta guía describe los flujos previstos según el [`contract.md`](./contract.md) + [`PARTNER_DECISIONS.md`](../../70-future/PARTNER_DECISIONS.md). Cuando el módulo se implemente (Sprint 19 / P3.10), este documento se valida y ajusta contra la realidad.

---

## ¿Qué es un partner?

Una **agencia o profesional** que revende productos de Aelium a sus clientes finales y cobra comisión. No es cliente directo; no es agente interno. Es una capa intermedia con su propio dashboard.

**Diferencias clave frente a otros roles:**

| Aspecto | Cliente | Agente | **Partner** |
|---------|---------|--------|-------------|
| Compra para sí | Sí | No | **No** (su cuenta partner no contrata servicios — ver §Vinculación) |
| Vende para Aelium | No | No | **Sí** (canal indirecto) |
| Acceso a clientes ajenos | No | Sí (todos) | **Solo a sus referidos** |
| Liquidación mensual | No | No | **Sí** (comisiones automáticas a fin de mes) |

---

## Flujos operativos para el admin

### 1. Aprobar un partner nuevo

**Cuándo:** un visitante se registra desde el formulario de partners y queda en estado `partner_pending`.

**Pasos:**

1. Recibes notificación interna: *"Nueva solicitud de partner: [Agencia X] · CIF: [xxx]"*.
2. Vas a `/dashboard/partners?status=pending`.
3. Revisas la ficha:
   - Nombre de la agencia, CIF, web.
   - Volumen estimado de clientes (informativo).
   - Datos fiscales para payouts.
4. **Decisión:**
   - **Aprobar** → rol cambia de `partner_pending` a `partner`. Se genera su `referral_code` y enlace personalizado. El partner recibe email de activación.
   - **Pedir documentación** → escribes mensaje al partner desde su ficha. Estado sigue `pending`.
   - **Rechazar** → estado pasa a `rejected`. El partner recibe email con el motivo. Puede volver a solicitar si corrige lo que falta.

**Tiempo de revisión esperado:** 24–48h tras solicitud (lo que dice el mensaje del dashboard bloqueado al partner).

---

### 2. Configurar comisión de un producto

**Cuándo:** crear un producto nuevo o ajustar comisiones existentes.

**Pasos:**

1. Vas a `/dashboard/products/[id]/edit`.
2. Sección "Comisión partner" → campo `partner_commission_pct`:
   - Decimal entre 0 y 100 (validado).
   - Si vacío o 0: ese producto no genera comisión para partners.
   - Aplica a TODOS los partners por igual (la configuración por-partner es excepcional, ver §Override).
3. Guardar → comisiones futuras usan el nuevo porcentaje. **Las comisiones ya generadas (en `partner_commissions`) son inmutables** (PART-INV-2).

**Override por-partner** (caso edge): si un partner negocia comisión distinta, el admin la configura en la ficha del partner (`Partner.commission_overrides` jsonb). Tiene prioridad sobre el porcentaje del producto.

---

### 3. Revisar payouts del mes

**Cuándo:** todos los días 1 de cada mes después del cron mensual de payouts.

**Pasos:**

1. Vas a `/dashboard/partners/payouts?month=YYYY-MM`.
2. Lista de payouts del mes con estados:
   - `pending` — calculado, aún no ejecutado.
   - `processing` — banking provider procesando.
   - `paid` — confirmado.
   - `failed` — banking provider rechazó.
3. **Si ves `failed`:**
   - Click en el payout → log del error del banking provider.
   - Causa típica: IBAN incorrecto, cuenta cerrada, monto sobre el umbral del banco.
   - Acción: contactar al partner desde su ficha → corregir IBAN → marcar payout para reintento (`PartnerPayoutService.retry()` lo encola).
4. **Si todos `paid`:** nada que hacer, el cron del mes próximo seguirá su curso.

**Alerta automática:** si un payout queda en `failed` >24h, recibes notificación interna con tag `payout_failed` (R7).

---

### 4. Resolver desvinculación cliente↔partner

**Workflow A — el cliente solicita desvincularse:**

1. El cliente pide la desvinculación desde su dashboard.
2. El partner recibe notificación con dos opciones:
   - **Aceptar** → desvinculación efectiva inmediata.
   - **Rechazar** → se abre ticket automático a un agente Aelium.
3. **Si llega ticket de desvinculación:** te aparece en la bandeja de soporte con tag `partner_unlink`. Lo asume un agente con rol `agent_full` o `superadmin`:
   - Lee motivo del cliente.
   - Lee motivo del rechazo del partner.
   - **Decide:**
     - Forzar desvinculación → el cliente queda como cliente directo de Aelium.
     - Mantener vínculo → notificar al cliente que mantiene su partner actual con justificación.
4. La decisión queda en audit log (R3).

**Workflow B — el partner desvincula a un cliente:**
- Se ejecuta inmediato. El cliente recibe notificación.
- No requiere intervención del admin salvo que el cliente proteste (entonces va a soporte normal).

---

### 5. Vinculación cuenta partner ↔ cuenta cliente

**Cuándo:** un partner quiere contratar servicios de Aelium para sí mismo. Por diseño, su cuenta partner NO puede contratar — debe crear cuenta cliente separada y vincular.

**Pasos:**

1. El partner solicita la vinculación desde su dashboard (introduce email partner + email cliente).
2. Los dos correos reciben confirmación del enlace.
3. **Te llega notificación interna:** *"Solicitud de vinculación: Partner [X] ↔ Cliente [Y]"*.
4. Revisas:
   - El partner está activo y al día con sus payouts.
   - La cuenta cliente existe y no tiene fraudes recientes.
5. **Aprobar** → desde la siguiente factura, se aplica el descuento configurado en `partner.linked_account_discount_pct` (default 5%).
6. **Rechazar** → notificas al partner con motivo.

**Desvinculación de cuentas:** mismo proceso revisado por agente.

---

### 6. Suspender / cancelar un partner (caso edge)

**Cuándo:** mal comportamiento (fraude, abuso, incumplimiento de términos).

**Pasos:**

1. Vas a la ficha del partner → menú ⋯ (D5: acción destructiva en menú contextual).
2. Acción "Suspender":
   - Estado del partner pasa a `suspended`.
   - Su dashboard queda bloqueado con mensaje "Tu cuenta está suspendida. Contacta con Aelium."
   - **NO se desvinculan automáticamente sus clientes.** Esa es decisión separada.
   - Las comisiones ya generadas se mantienen para liquidar (no se confiscan salvo investigación legal).
3. Acción "Cancelar partner":
   - Estado `cancelled`. Sus clientes se desvinculan automáticamente y quedan como directos de Aelium.
   - Comisiones pendientes se liquidan en el siguiente cron mensual y luego se cierra la cuenta.

---

## Métricas operativas (panel admin de partners)

`/dashboard/partners` muestra:

- **Total partners activos** / `pending` / `suspended` / `rejected`.
- **Comisiones pagadas mes en curso** (€).
- **Comisiones pendientes de liquidar** (€).
- **Payouts fallidos pendientes** (alerta visible si >0).
- Top 5 partners por comisión generada (mes en curso).

---

## Cosas a NO hacer

❌ **Modificar `partner_commissions` históricas.** Son inmutables (PART-INV-2). Errores se compensan con registros nuevos negativos, no editando.
❌ **Editar `partner_notes`.** Inmutables (PART-INV-3 — misma lógica que audit log).
❌ **Ejecutar payouts manualmente desde el código** sin pasar por el cron + Outbox. Riesgo de descuadres financieros (R8).
❌ **Asignar rol `partner` desde la UI directamente.** Solo se llega a `partner` aprobando un `partner_pending` previo (mantiene trazabilidad del onboarding).

---

## Cuando algo se rompe

| Síntoma | Probable causa | Acción inicial |
|---------|----------------|----------------|
| Partner reporta que no ve un cliente que debería estar referido | El `users.partner_id` no se vinculó al registrarse vía `referral_code` | Verificar `audit_change_log` del user; si referral fue válido al registro, vincular manualmente |
| Comisión calculada incorrecta | `partner_commission_pct` cambió entre el `invoice.created` y `invoice.paid` | Verificar timestamps; si comisión inmutable está mal por bug, generar `partner_commissions` compensatoria con autor "system" |
| Payout falló N veces | IBAN inválido o problema banking provider | Notificar al partner; pausar reintentos hasta resolver; documentar en ficha |
| Solicitud de vinculación aprobada pero el descuento no se aplica | Bug en cálculo de pricing al checkout | Investigar; aplicar descuento manual en factura draft mientras se arregla |

Cualquier incidencia que afecte dinero (comisiones, payouts) debe quedar en audit log con autor + nota explicativa antes de cerrarla.

---

## Documentos relacionados

- [`contract.md`](./contract.md) — Especificación técnica del módulo (modelos, eventos, endpoints, invariantes).
- [`docs/PARTNER_DECISIONS.md`](../../70-future/PARTNER_DECISIONS.md) — Decisiones de producto detalladas.
- [`docs/PARTNER_ARCHITECTURE.md`](../../70-future/PARTNER_ARCHITECTURE.md) — Arquitectura técnica.
- [`docs/PARTNER_SCHEMA.md`](../../70-future/PARTNER_SCHEMA.md) — Schema completo (8 tablas + campos en existentes).
- [ADRs partner](../../10-decisions/) — ADR-048 a ADR-054 cubren modelo, onboarding, permisos, comisiones, desvinculación, vinculación cuenta cliente, referidos.
- [`docs/00-foundations/glossary.md`](../../00-foundations/glossary.md) — Términos: [Partner], [Cliente del partner], [Comisión], [Liquidación / Payout], [Desvinculación].

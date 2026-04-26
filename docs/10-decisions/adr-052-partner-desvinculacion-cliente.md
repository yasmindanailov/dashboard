# ADR-052 — Desvinculación cliente-partner (workflow + protección)

> **Status:** Active (planificada — Fase 2)
> **Date:** 2026-04 · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §35 (desvinculación)
> **Domain:** partner

---

## Contexto

La relación cliente-partner es **operativamente vinculante** durante la vida del cliente: las comisiones del partner dependen de que el cliente tenga `partner_id != null` cuando se factura. Pero esta relación **debe poder romperse** en situaciones reales:

- El cliente queda insatisfecho con la agencia y prefiere relación directa con Aelium.
- El partner deja de operar o se vuelve negligente.
- El partner decide soltar a un cliente (poco rentable, conflictivo, etc.).

Sin un proceso documentado:
- **El cliente queda atrapado** (no hay forma de "salir" del partner).
- **El partner es sorprendido** sin poder defender la relación.
- **Aelium queda en medio** sin reglas claras de cómo arbitrar.
- **Los servicios y facturas existentes** quedan en estado ambiguo (¿se mantiene la comisión por lo ya cobrado? ¿qué pasa con renovaciones?).

Hace falta workflow explícito para los **dos casos** (cliente solicita / partner desvincula) y reglas claras de qué pasa después.

---

## Decisión

### Caso A — El cliente solicita desvincularse

```
1. Cliente → /dashboard/partner-relationship → "Solicitar desvinculación"
   - Razón opcional (texto libre)
   - Crea registro en partner_unlink_requests:
     id, client_id, partner_id, requested_by='client',
     reason, status='pending', created_at

2. Notificación al partner: "Cliente X solicita desvinculación"
   El partner ve la solicitud en su dashboard

3. Partner decide:
   3.A. ACEPTA → desvinculación inmediata
        - status = 'accepted'
        - Aplica desvinculación (ver "Aplicación")
        - Cliente recibe notificación
   3.B. RECHAZA → genera ticket a un agente de Aelium
        - status = 'partner_rejected'
        - El sistema crea automáticamente un ticket
          (categoría: support_general, asignado al pool de agentes)
        - El agente revisa el caso

4. Si el agente revisa:
   - Puede forzar la desvinculación (status = 'forced_by_agent')
   - O confirmar el rechazo del partner si la razón no es válida
     (status = 'rejected_by_agent')

5. Regla final: el cliente SIEMPRE puede desvincularse si tiene razones válidas
   (mal servicio, abuso, falta de respuesta del partner). El agente es el
   árbitro final.
```

### Caso B — El partner desvincula a un cliente

```
1. Partner → /dashboard/partner/clients/<id> → "Desvincular cliente"
   - Razón opcional (texto libre, queda registrada)
   - Aplica desvinculación inmediatamente (sin permiso del cliente)
   - status del registro = 'partner_initiated'

2. Cliente recibe notificación:
   "Tu agencia [Nombre] ha terminado la relación contigo.
    Sigues teniendo todos tus servicios activos como cliente directo de Aelium."

3. Sin proceso de revisión — el partner tiene derecho a soltar al cliente sin justificar.
```

### Aplicación de la desvinculación

Para **ambos casos**, cuando se aplica:

```
1. Atómico (transacción única):
   - users.partner_id = NULL
   - services.partner_id = NULL  (todos los servicios activos del cliente)
   - invoices futuras NO tendrán partner_id (las facturas pasadas se conservan tal cual — R3)
   - Crear entry en audit_change_log: who, when, reason

2. Comisiones ya generadas (partner_commissions con accrued_at < ahora):
   - Se conservan tal cual (el partner las cobrará en su próxima liquidación).
   - status sigue siendo 'accrued' o 'liquidated'.

3. Comisiones futuras:
   - No se generan más para este cliente.

4. El cliente queda como cliente directo de Aelium:
   - Las facturas siguen con la misma numeración secuencial.
   - El label "Aelium · Partner con [X]" se elimina de las nuevas facturas.
   - Las facturas pasadas conservan el label (snapshot histórico — R3).

5. El partner ve el cliente en su histórico (status='unlinked') pero sin acceso operativo.
```

### Estados de `partner_unlink_requests`

| Status | Significado |
|--------|-------------|
| `pending` | Cliente solicitó, esperando respuesta del partner |
| `accepted` | Partner aceptó voluntariamente |
| `partner_rejected` | Partner rechazó, ticket creado para agente Aelium |
| `forced_by_agent` | Agente Aelium forzó la desvinculación |
| `rejected_by_agent` | Agente Aelium confirmó el rechazo del partner |
| `partner_initiated` | El partner desvinculó unilateralmente |
| `cancelled` | El cliente retiró la solicitud antes de que se resolviera |

### Auditoría completa

Cada cambio de status genera entrada en `audit_change_log` (R3, ADR-017):
- Quién (cliente / partner / agente).
- Cuándo.
- Razón.
- Estado anterior y nuevo.

Esta información es **inmutable** y consultable para resolución de disputas.

### El cliente vuelve a poder ser de un partner (mismo u otro)

Tras desvincularse, el cliente queda libre. Puede:
- **Registrarse via referral_code** de otro partner → asociación con nuevo partner desde ese momento.
- **Volver al partner anterior** mediante invitación (futuro: workflow específico).

**No hay penalización** — Aelium prioriza la libertad del cliente.

---

## Consecuencias

- ✅ **Ganamos:**
  - Workflow claro para una situación inevitable (relaciones se rompen).
  - El cliente nunca queda atrapado — siempre puede salir.
  - El partner tiene voz (puede aceptar/rechazar) pero no veto absoluto.
  - Auditoría completa para resolución de disputas.
  - Comisiones pasadas se respetan — el partner no pierde lo ganado.
- ⚠️ **Aceptamos:**
  - **Friction inicial** — el cliente solicita y espera respuesta del partner. Mitigación: SLA implícito de 48h al partner para responder; tras eso, el cliente puede escalar directamente.
  - **El agente Aelium decide en disputa** — carga de trabajo para el equipo. Mitigación: reglas claras de cuándo procede forzar (mal servicio comprobable, partner inactivo, abuso).
  - **El partner puede desvincular sin justificar** — riesgo de que clientes se queden de repente sin agencia. Mitigación: el cliente queda como directo de Aelium con plena continuidad de servicio.
  - Las **facturas pasadas conservan `partner_label`** — el cliente ve una mezcla de facturas con y sin label tras desvincularse. Aceptable: refleja la historia.
- 🚪 **Cierra:**
  - **No retención forzada** del cliente por parte del partner. El cliente siempre tiene salida.
  - **No revertir comisiones pasadas** cuando se desvincula. Se respeta lo ganado por trabajo previo.
  - **No "vetos definitivos"** entre cliente y partner — si surge oportunidad futura de re-vincularse, se permite.

---

## Cuándo revisar

- Si el porcentaje de desvinculaciones es alto (>20% de clientes/año por partner) → señal de problema de calidad del partner — revisar criterios de aprobación (ADR-049).
- Si los partners abusan del rechazo (la mayoría de solicitudes acaban en `partner_rejected` y luego `forced_by_agent`) → considerar quitar el step de revisión del partner (cliente solicita → desvinculación directa).
- Si surgen disputas legales sobre comisiones pasadas → revisar política de "se respetan comisiones generadas" — puede necesitar matización.

---

## Referencias

- **Módulos afectados:** partner, users, services, invoices, support (ticket cuando partner rechaza), notifications.
- **Reglas relacionadas:** R1 (módulos por eventos), R3 (audit log + facturas pasadas inmutables), R12 (permisos del partner para desvincular).
- **ADRs relacionados:** ADR-048 (modelo partner), ADR-049 (roles), ADR-050 (permisos — desvincular es uno), ADR-051 (comisiones — pasadas se respetan), ADR-017 (audit log), ADR-037 (tickets — usado para escalación cuando partner rechaza).
- **Glosario:** [Desvinculación](../00-foundations/glossary.md), [Cliente directo](../00-foundations/glossary.md), [Partner](../00-foundations/glossary.md).
- **SLA recomendado:** partner responde solicitud en ≤48h, tras lo cual el cliente puede escalar al agente Aelium directamente (configurable en settings).

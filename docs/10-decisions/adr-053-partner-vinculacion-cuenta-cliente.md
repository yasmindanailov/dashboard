# ADR-053 — Vinculación cuenta partner ↔ cuenta cliente del mismo usuario

> **Status:** Active (planificada — Fase 2)
> **Date:** 2026-04 · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §35 (cuenta cliente vinculada al partner)
> **Domain:** partner

---

## Contexto

Una agencia partner (ADR-048) **también puede ser cliente de Aelium** — necesita hosting para su propia web, Nextcloud para su equipo, Support Inside para su operativa interna. Pero la cuenta de **partner no puede contratar servicios** (es una capa intermedia, no es una cuenta de cliente normal).

Sin un mecanismo de vinculación, la agencia se enfrenta a:
- **Dos cuentas separadas con dos emails distintos** → tiene que recordar dos logins, dos pantallas, dos identidades.
- **Pérdida de descuento** — muchas agencias esperan precio especial por ser "partner + cliente" (incentivo a usar Aelium internamente).
- **Pérdida de visibilidad** — desde la cuenta de partner no ve sus propios servicios; desde la cuenta de cliente no ve sus comisiones.

Hace falta un proceso que **vincule ambas cuentas** del mismo usuario, permita switch fácil entre ellas, y aplique un **descuento configurable** sobre la cuenta de cliente.

---

## Decisión

### Principio

**Una persona / agencia puede tener:**
1. Una **cuenta partner** (rol `partner`) — gestiona sus clientes y comisiones.
2. Una **cuenta cliente** separada (rol `client`) — contrata servicios para sí misma.
3. **Ambas cuentas vinculadas** — la cuenta cliente recibe descuento especial por ser del partner.

**No** se mezclan en una sola cuenta. **No** hay rol "partner_y_cliente". Son dos cuentas distintas, con dos emails (puede ser el mismo email — el sistema lo permite si los roles son distintos), conectadas mediante una FK opcional.

### Modelo de datos

Campo en `users` (cuenta cliente):

```
users.linked_partner_account_id → FK nullable a partners
```

Cuando este campo está poblado:
- La cuenta cliente recibe el descuento configurado en `partners.linked_client_discount_pct`.
- En el dashboard del partner aparece un botón **"Cambiar a mi cuenta cliente"** (switch).
- En el dashboard del cliente aparece un botón **"Cambiar a mi cuenta partner"** (switch inverso).

### Proceso de vinculación

```
1. Partner inicia desde su perfil:
   /dashboard/partner/profile → "Vincular cuenta cliente"
   Introduce dos emails:
   - Email de su cuenta partner (verificación)
   - Email de su cuenta cliente (la cuenta a vincular)

2. Sistema valida:
   - Ambos emails existen en el sistema.
   - El email partner es de una cuenta con rol partner activo.
   - El email cliente es de una cuenta con rol client*.
   - No hay vinculación previa activa para ninguno de los dos.

3. Sistema envía email de confirmación al email cliente:
   "Tu cuenta de cliente recibirá un descuento del X% por estar vinculada al partner Y.
    Confirma esta vinculación."

4. Cliente confirma → status='pending_admin_approval'

5. Notificación al admin: "Solicitud de vinculación cuenta partner+cliente"
   Admin revisa y aprueba o rechaza:
   - APROBADO:
     - users.linked_partner_account_id = partner_id
     - status='active'
     - Descuento se aplica desde la siguiente factura
   - RECHAZADO:
     - status='rejected'
     - Email al partner con motivo
```

### Descuento configurable

- `partners.linked_client_discount_pct` (decimal nullable).
- Configurable por **el admin** al aprobar (puede ser distinto por partner — partners grandes pueden recibir más).
- Tipo de descuento: **porcentaje sobre subtotal** o **importe fijo** (definible al aprobar).
- Si `linked_client_discount_pct = NULL` → vinculación sin descuento (solo conveniencia operativa).

### Switch entre cuentas

En la cabecera del dashboard, cuando el usuario tiene cuentas vinculadas:

```
┌─────────────────────────────────┐
│ 👤 mi-agencia (Partner)      ▾ │
├─────────────────────────────────┤
│ ↻ Cambiar a mi cuenta cliente │
└─────────────────────────────────┘
```

Implementación: el switch genera **un JWT nuevo** para la otra cuenta (sin pedir contraseña — la vinculación ya autorizó esto). El usuario aterriza en el dashboard de la otra cuenta inmediatamente.

### Reglas de auditoría

- Cada switch entre cuentas se registra en `audit_access_log` (R3, ADR-017).
- La vinculación / desvinculación queda en `audit_change_log`.
- Indispensable para investigar uso anómalo (ej: ¿el partner accedió a su cuenta cliente para hacer X?).

### Desvinculación

- Cualquier de las dos cuentas puede solicitar desvinculación desde su perfil.
- No requiere aprobación de la otra parte ni del admin (la decisión es del usuario sobre sus propias cuentas).
- Tras desvincular: el descuento deja de aplicarse en la siguiente factura. Las facturas pasadas conservan su descuento histórico (R3).

### El partner como cliente sin vinculación (opción permitida)

El partner **puede** crear una cuenta cliente sin vincularla. En ese caso:
- Sin descuento.
- Sin switch fácil entre ambas (debe hacer logout + login).
- Aceptable, aunque la mayoría querrá vincular.

---

## Consecuencias

- ✅ **Ganamos:**
  - El partner usa Aelium como cliente sin perder su identidad de partner ni mezclar contextos.
  - Descuento como **incentivo** para que el partner mismo use el producto (= mejor demo, mejor soporte propio).
  - Switch entre cuentas reduce fricción operativa.
  - Auditoría completa de qué identidad realiza qué acción.
- ⚠️ **Aceptamos:**
  - **Doble cuenta** sigue siendo doble cuenta — el usuario gestiona dos passwords (o el mismo, si el sistema lo permite — depende de unicidad de email).
  - **Aprobación manual del admin** introduce fricción. Mitigación: aceptable (volumen bajo) y permite calibrar el descuento individualmente.
  - **Switch sin contraseña** (JWT generado en backend) introduce superficie de ataque si la sesión de partner se compromete → atacante accede a cuenta cliente vinculada. Mitigación: 2FA obligatoria en cuenta partner (ADR-013) y log de accesos.
  - Descuento variable por partner = inconsistencia perceptible si los partners se comparan entre sí. Mitigación: descuento es información privada del acuerdo partner-Aelium.
- 🚪 **Cierra:**
  - **No fusión de cuentas en una sola** — siempre dos cuentas con vinculación opcional.
  - **No descuento aplicable retroactivamente** — afecta solo desde la siguiente factura.

---

## Cuándo revisar

- Si el volumen de vinculaciones es alto y la aprobación manual escala mal → automatizar para descuentos < umbral configurable.
- Si los partners abusan del descuento (cuentas cliente fantasma para revender más barato) → reglas anti-abuso (límite de servicios, validación de uso real).
- Si surge demanda de "cuenta cliente para empleados del partner" (no solo para la agencia entera) → modelo más complejo de vinculación N:1.

---

## Referencias

- **Módulos afectados:** partner, users (FK `linked_partner_account_id`), auth (switch entre cuentas), billing (aplicación del descuento).
- **Reglas relacionadas:** R3 (audit log), R12 (permisos), R7 (defense in depth — switch valida vinculación en backend).
- **ADRs relacionados:** ADR-048 (modelo partner), ADR-049 (roles — partner y client conviven), ADR-013 (2FA — obligatorio en cuentas privilegiadas como partner), ADR-017 (audit log), ADR-023 (promociones — descuentos siguen reglas similares).
- **Glosario:** [Vinculación](../00-foundations/glossary.md), [Switch de cuenta](../00-foundations/glossary.md), [Descuento partner](../00-foundations/glossary.md).
- **Implementación pendiente:** módulo `partner.account_linking` + switch en frontend.

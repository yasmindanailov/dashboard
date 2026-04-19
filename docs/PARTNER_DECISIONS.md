# PARTNER_DECISIONS.md — Módulo Partner Aelium
> Documento de decisiones de producto para el módulo Partner.
> Fase 2 del proyecto. Lee también DECISIONS.md para el contexto global.
> Versión 1.0 | Abril 2026

---

## 1. CONCEPTO Y MODELO DE NEGOCIO

### Qué es un partner
El partner es una agencia que revende productos de Aelium a sus clientes finales.
No es un cliente normal ni un agente interno. Es una capa intermedia con su propio
dashboard, su propio sistema de comisiones, y sus propios clientes vinculados.

### Flujo de dinero
```
Cliente final del partner paga a Aelium
         │
         ▼
Aelium retiene su parte (precio - comisión del partner)
         │
         ▼
Aelium liquida la comisión al partner automáticamente a fin de mes
```

### Margen y comisiones
- El margen se define por producto al crearlo en el catálogo.
- Campo en `products`: `partner_commission_pct` (decimal nullable).
- El partner recibe comisión sobre TODOS los productos y servicios
  que contraten sus clientes — incluyendo Support Inside y sus slots.
- El partner no puede cambiar los precios al cliente final (por ahora · abierto al futuro).

### Factura al cliente final del partner
- Emitida por Aelium.
- Formato visible: "Aelium · Partner con [Nombre de la agencia]".
- El cliente final sabe que contrata con Aelium como proveedor,
  con la agencia como intermediaria.

---

## 2. AUTH Y ROLES

- Mismo sistema de autenticación que todos los usuarios. Misma URL de login.
- El rol determina la experiencia completa del dashboard.

### Roles nuevos
```
partner_pending → Registrado · email verificado · pendiente de aprobación manual
partner         → Aprobado · acceso completo al dashboard partner
```

---

## 3. ONBOARDING SEMI-AUTOMÁTICO

```
PASO 1 — Registro del partner
  Formulario estándar de Aelium más campos adicionales:
  ├── Nombre de la agencia
  ├── CIF de la agencia
  ├── Web de la agencia
  └── Volumen estimado de clientes (informativo)

PASO 2 — Verificación de email
  Igual que cualquier cliente
  Al verificar → accede al dashboard con rol partner_pending
  Dashboard bloqueado · solo puede completar su perfil

PASO 3 — Dashboard bloqueado (partner_pending)
  El partner ve:
  "Tu solicitud está siendo revisada.
   Nuestro equipo se pondrá en contacto contigo
   en las próximas 24-48 horas."
  Puede completar datos de la agencia y de facturación

PASO 4 — Notificación al admin
  "Nueva solicitud de partner: [Agencia] · CIF: [xxx]"
  El admin puede: revisar datos · contactar · pedir documentación

PASO 5 — Aprobación manual por el admin
  → Rol cambia de partner_pending a partner
  → Se genera el referral_code y el enlace de registro personalizado
  → El partner recibe email de activación
  → Dashboard completamente desbloqueado

PASO 6 — Rechazo (si aplica)
  → El partner recibe email con el motivo del rechazo
  → Estado: rejected
  → Puede volver a solicitar si corrige lo que falta
```

---

## 4. PERMISOS DEL PARTNER

### Puede
```
Ver sus clientes y sus servicios (solo lectura)
Ver facturas de sus clientes (solo lectura)
Ver su comisión acumulada por producto y cliente
Ver historial de soporte de sus clientes (solo lectura)
Enviar notificaciones unidireccionales a sus clientes
Registrar clientes via su enlace personalizado
Ver y gestionar su propia facturación con Aelium
Ver el historial de liquidaciones recibidas
Añadir notas sobre sus clientes (inmutables)
Desvincular clientes desde su dashboard
Abrir tickets a sus clientes (el cliente puede responder)
Ver métricas de su panel de inicio
```

### No puede
```
Ver clientes de otros partners
Cambiar precios de productos
Suspender o cancelar servicios de sus clientes
Crear facturas manuales
Intervenir en conversaciones de soporte cliente-Aelium
Tocar configuración del sistema
Ver márgenes internos de Aelium
Contactar con sus clientes via chat del dashboard
Aprobar o rechazar liquidaciones (son automáticas)
```

---

## 5. REGISTRO DEL CLIENTE FINAL DEL PARTNER

- El cliente final se registra usando el enlace personalizado del partner.
- Ve el mismo formulario que cualquier cliente de Aelium.
- Diferencia visible: "Aelium · Partner con [Nombre de la agencia]".
- El cliente sabe que contrata con Aelium como proveedor.
- La agencia actúa como intermediaria — no como proveedor directo.

---

## 6. DASHBOARD DEL PARTNER Y DEL CLIENTE FINAL

### El dashboard es el mismo sistema para todos
- Mismo dashboard que cualquier cliente o agente de Aelium.
- El rol y el contexto determinan lo que se ve.

### Indicador de partner
- El partner ve en su dashboard: "Aelium · Partner with [Agencia X]"
- El cliente final del partner también ve: "Aelium · Partner with [Agencia X]"
- El indicador aparece bajo el logo o en un lugar visible consistente.

---

## 7. COMUNICACIÓN — TICKETS Y CHAT

### El cliente final y Aelium
- Todo chat o ticket del cliente final va directamente a Aelium.
- El partner no interviene en estas conversaciones.
- El partner puede ver el historial de soporte de sus clientes (solo lectura).

### El partner y su cliente final
- El partner puede abrir tickets al cliente final desde su dashboard.
- El cliente final puede responder a ese ticket directamente al partner.
- Aelium siempre tiene visibilidad de estos tickets como contexto del cliente.
- Estos tickets los puede ver cualquier agente de Aelium.
- El partner NO puede iniciar chats en tiempo real con sus clientes.

### Notas del partner sobre sus clientes
- El partner añade notas desde la ficha de cada cliente en su dashboard.
- Las notas son texto libre. En el futuro: etiquetas en categorías personalizables.
- Las ven: agentes de Aelium.
- El cliente final: ve en su portal de transparencia que se añadió una nota,
  sin ver el contenido.
- El partner es informado de que el cliente puede ver que existe la nota.
- Las notas son INMUTABLES. No se pueden editar ni borrar.
  Misma lógica de inmutabilidad que el audit log.

---

## 8. DESVINCULACIÓN CLIENTE-PARTNER

### El cliente solicita desvincularse
```
1. Cliente solicita desvinculación desde su dashboard
2. Notificación al partner
3. El partner puede:
   ├── ACEPTAR → desvinculación efectiva inmediata
   └── RECHAZAR → se abre ticket a un agente de Aelium
                  para que revise el caso

4. El agente de Aelium revisa:
   ├── Motivo del cliente para desvincularse
   └── Motivo del partner para rechazarlo

5. El cliente puede desvincularse siempre que quiera
   El admin/agente puede forzar la desvinculación
   si el cliente tiene razones válidas
```

### El partner desvincula a un cliente
```
El partner puede desvincular a cualquiera de sus clientes
desde su dashboard de partner
El cliente recibe notificación de la desvinculación
```

### Después de la desvinculación
```
El cliente queda como cliente directo de Aelium
Sin vinculación a ningún partner
Sus servicios activos siguen funcionando con normalidad
Las facturas futuras no llevan el label del partner
```

---

## 9. CLIENTE SIN SERVICIOS — SUSPENSIÓN DE CUENTA

```
Cliente del partner cancela todos sus servicios
         │
         ▼
La vinculación con el partner y con Aelium se mantiene
La cuenta queda activa sin servicios
         │
         ▼
Después de X tiempo sin servicios → cuenta suspendida
X configurable en settings globales del admin
Misma lógica que cualquier cliente de Aelium sin servicios
```

---

## 10. EL PARTNER COMO CLIENTE DE AELIUM

- El partner NO tiene servicios contratados en su cuenta de partner.
- Si quiere servicios → crea una cuenta de cliente normal separada.
- Puede vincular ambas cuentas (partner + cliente normal).

### Proceso de vinculación de cuentas
```
1. El partner introduce su email de cuenta partner
   y su email de cuenta cliente en el formulario
2. Se envía email de confirmación a ambas cuentas
3. Queda pendiente de aprobación manual por un admin/agente
4. El admin revisa y aprueba la vinculación
5. Desde la siguiente factura → se aplica el descuento configurado
```

### El descuento para partners vinculados
- Configurable por el admin (porcentaje o importe fijo).
- Se aplica desde la siguiente factura a la aprobación de la vinculación.
- La desvinculación de cuentas es un proceso manual revisado por un agente.

---

## 11. LIQUIDACIONES AL PARTNER

### Proceso automático
- Completamente automático a fin de mes.
- Sin aprobación del partner ni del admin.
- El sistema calcula: suma de comisiones generadas en el período.
- Ejecuta la transferencia según el método de payout configurado.

### Métodos de payout disponibles (el partner elige)
```
SEPA        → transferencia bancaria via IBAN
Stripe Connect → transferencia automática via Stripe
```

### Lo que ve el partner después de la liquidación
- Resumen detallado de lo liquidado.
- Comisión por cliente y por producto.
- Fecha y método de transferencia.
- Estado: completada / fallida.

---

## 12. MÉTRICAS DEL DASHBOARD DE INICIO DEL PARTNER

```
Comisión acumulada este mes
Próxima liquidación (fecha e importe estimado)
Clientes activos
Nuevos clientes registrados este mes
Clientes con facturas vencidas (afectan a comisiones)
Servicios próximos a renovar de sus clientes
Clientes con conversaciones de soporte abiertas
```

---

## 13. SOPORTE AL CLIENTE FINAL DEL PARTNER

- Aelium da soporte directamente al cliente final del partner.
- El flujo de soporte es idéntico al de cualquier cliente de Aelium.
- El agente ve en la ficha del cliente el contexto extra del partner:
  - Nombre del partner al que pertenece.
  - Notas del partner sobre ese cliente.
  - Historial de tickets entre el partner y ese cliente.
  - Historial de notificaciones del partner al cliente.

### Support Inside para clientes del partner
- Solo el cliente final lo contrata. El partner no puede contratarlo por él.
- El partner asesora a su cliente sobre si contratarlo o no.
- El partner recibe su comisión sobre el Support Inside y sus slots
  exactamente igual que sobre cualquier otro producto.

---

## 14. ESTRUCTURA DEL DASHBOARD DEL PARTNER

```
🏠 Inicio
  Métricas clave del día y del mes

👥 Mis clientes
  Lista de clientes vinculados via su enlace
  Ficha de cada cliente (solo lectura)
  Historial de soporte (solo lectura)
  Notas sobre el cliente (añadir · inmutables)
  Tickets al cliente (abrir · ver historial)
  Notificaciones unidireccionales (enviar · ver historial)
  Desvincular cliente

💰 Mis comisiones
  Comisión acumulada por cliente y producto
  Historial de liquidaciones recibidas
  Próxima liquidación estimada

🔗 Mi enlace de partner
  Enlace personalizado para registrar clientes
  Estadísticas: registrados · han comprado · activos

🧾 Mi facturación
  Sus propias facturas con Aelium
  Sus servicios como partner

👤 Mi perfil
  Datos de la agencia
  Método de payout (SEPA · Stripe Connect)
  Datos de facturación
  Vinculación con cuenta de cliente (si aplica)
```

---

## 15. DECISIONES PENDIENTES DEL MÓDULO PARTNER

```
Precio del producto al cliente del partner
  → ¿Puede el partner en el futuro personalizar precios?
  → Dejado abierto · por ahora precio fijo de Aelium

Categorías de notas del partner
  → Texto libre por ahora
  → Etiquetas personalizables en fase posterior

Descuento exacto para partners vinculados como clientes
  → Configurable por el admin · importe por definir

Límite de tiempo para suspender cuenta sin servicios
  → Configurable en settings · valor por defecto por definir

Comisión sobre Support Inside con slots adicionales
  → Confirmar cálculo: ¿comisión sobre el precio total del slot
    o solo sobre el precio base del Support Inside?
```

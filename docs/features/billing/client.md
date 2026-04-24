# Billing — Client Guide

> Guía para el cliente final del módulo de facturación.
> Última actualización: Sprint 7.5

## Tus facturas

Desde tu panel de cliente puedes:

- **Ver** todas tus facturas con su estado actual
- **Filtrar** por estado (pendiente, pagada, vencida...)
- **Descargar** el PDF de cualquier factura
- **Consultar** el desglose de cada factura (conceptos, IVA, descuentos)

> Las facturas siempre están vinculadas a tu cuenta de usuario. El sistema conoce
> quién eres y muestra tu nombre en la factura automáticamente.

## Acciones disponibles

Como cliente, puedes:
- ✅ Ver el listado de tus facturas
- ✅ Ver el detalle de cada factura (conceptos, IVA, totales)
- ✅ Descargar el PDF
- ❌ Enviar, cancelar o marcar como pagada (solo el equipo de Aelium)

## Estados de factura

| Estado | Significado |
|--------|-------------|
| 🟡 Pendiente | Factura emitida, pendiente de pago |
| 🟢 Pagada | Pago confirmado |
| 🔴 Vencida | Pasó la fecha de vencimiento sin pago |
| ⚪ Cancelada | Factura anulada |
| 🟣 Reembolsada | Importe devuelto |

## Proceso de pago

1. Recibes un email cuando se genera una nueva factura
2. Accedes a tu panel y realizas el pago
3. Recibes confirmación por email
4. Tu servicio se activa automáticamente

## Precios e IVA

- Los precios que ves en el catálogo son **sin IVA**.
- Al contratar, el sistema calcula y añade el IVA (21%) automáticamente.
- En tu factura verás el desglose: **Subtotal → IVA → Total**.

## ¿Qué pasa si no pago a tiempo?

1. **Período de gracia**: Días de margen configurados por producto
2. **Reintentos**: Intentamos cobrar automáticamente (recibirás avisos)
3. **Suspensión**: Si los reintentos se agotan, tu servicio se suspende
4. **Cancelación**: Si continúa el impago, el servicio se cancela automáticamente
5. **Retención**: Tus datos se conservan X días después de la cancelación

> ⚠️ Puedes evitar la suspensión regularizando el pago en cualquier momento.

## Pausar tu servicio

Si necesitas pausar temporalmente tu servicio:

1. Ve a **Mis servicios** → Selecciona el servicio
2. Haz clic en **Pausar suscripción**
3. Tu servicio quedará congelado por el tiempo máximo permitido
4. Al expirar la pausa, el servicio se reactiva automáticamente

> No todos los productos permiten pausa. Consulta las condiciones de tu plan.

## Cambiar de plan

Puedes cambiar entre ciclos de facturación (mensual ↔ anual):

1. Ve al detalle de tu servicio
2. Selecciona **Cambiar plan**
3. Verás un **preview del prorrateo**: crédito por días no consumidos
4. El crédito se descuenta del nuevo importe — nunca se reembolsa

## Perfil de facturación

Puedes tener múltiples perfiles de facturación:

- **Personal**: Tu nombre y apellidos → Factura simplificada (sin NIF)
- **Autónomo**: Tu nombre + NIF obligatorio → Factura completa
- **Empresa**: Razón social + CIF obligatorio → Factura completa

### Sin perfil de facturación

Si no has creado ningún perfil, tus facturas se emiten como **factura simplificada**
a nombre de tu usuario (nombre + apellidos + email). Puedes añadir un NIF en cualquier
momento desde tus datos de facturación para recibir facturas completas.

### Perfil por defecto

Puedes definir un perfil como predeterminado. Al contratar un nuevo servicio,
se usará ese perfil automáticamente. Puedes cambiarlo en cada compra.

### Cambiar perfil en servicio activo

Si cambias el perfil de facturación de un servicio activo, el cambio aplica
**desde la próxima factura** (no afecta a las anteriores).

## Contratar un servicio

1. Selecciona un producto del catálogo
2. Elige el ciclo de facturación (mensual, anual...)
3. Selecciona tu perfil de facturación (o usa tu perfil por defecto)
4. Opcionalmente, asigna una etiqueta y dominio
5. Confirma el pedido

> En la pantalla de perfil verás tu nombre y email como opción de factura simplificada.
> Si tienes perfiles creados (con NIF/CIF), podrás seleccionarlos para factura completa.

## Descargar facturas

Desde la lista de facturas o el detalle, haz clic en **📥 PDF** para descargar tu factura
en formato PDF. La factura incluye:

- Datos de Aelium (emisor)
- Tus datos de facturación (o tu nombre si no tienes perfil)
- Desglose de conceptos con período
- Subtotal, IVA y Total
- Estado del pago

## Mejoras de experiencia (Sprint 7.5)

- **Búsqueda instantánea** de facturas por número
- **Tabs por estado** para filtrar rápidamente (Todas, Pendientes, Pagadas, Vencidas)
- **Tooltips de ayuda** en columna “Vencimiento” y en el checkout (solo visibles para clientes)
- **Indicador de pasos** visual en el checkout (Producto → Plan → Facturación → Confirmar)
- **Skeleton loading** para carga fluida sin pantalla en blanco
- **Mensajes de acción** claros tras cada operación (“Factura descargada”, etc.)

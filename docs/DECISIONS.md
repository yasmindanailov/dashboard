# DECISIONS.md — Aelium Dashboard
> Documento de decisiones de producto y lógica de negocio.
> Versión 1.1 | Abril 2026
> Este documento es la fuente de verdad del **modelo de negocio**.
> Para arquitectura técnica, ver ARCHITECTURE.md.

---

## 1. QUÉ ES ESTE PROYECTO

Dashboard de billing, soporte y gestión de servicios para Aelium.
Reemplaza WHMCS. Uso interno exclusivo — no es un SaaS.
Operación en España. Un solo negocio. Un solo dashboard.

**Referentes de inspiración:** WHMCS · hPanel de Hostinger · OVHcloud Manager

**Documento de marca:** Aelium Brand Identity v1.6 (ver documento adjunto)
**Eslogan:** "Tu socio digital, a tu lado."
**Color principal:** #3B82F6 · **Tipografía:** DM Sans 400/500/600

---

## 2. STACK TECNOLÓGICO

> El stack completo con versiones exactas está en ARCHITECTURE.md.
> Esta sección solo lista las decisiones de producto sobre tecnología.

```
Frontend:    Next.js 16 (App Router) · Tailwind CSS 4 · shadcn/ui
Backend:     NestJS 11 · TypeScript · Prisma 7
Base datos:  PostgreSQL 16 (self-hosted en Docker)
Cache:       Redis 7 (self-hosted en Docker)
Colas:       BullMQ (sobre Redis)
Pagos:       Stripe (plugin base)
Email:       nodemailer (SMTP configurable · MailPit en dev)
IA:          Claude API (plugin base · arquitectura swappable)
Tiempo real: Socket.io (WebSockets)
Deploy:      Docker Compose en servidor propio · Traefik
Storage:     MinIO (S3-compatible, self-hosted en Docker)
```

---

## 3. REGLAS DE ARQUITECTURA

> Las 13 reglas técnicas detalladas con ejemplos de código están en ARCHITECTURE.md.
> Esta sección resume los principios de negocio que las originan.

1. **Los módulos son independientes.** Si uno falla, los demás siguen.
2. **Nada lento en el hilo principal.** El dashboard responde siempre en <200ms.
3. **El audit log es inmutable.** Solo INSERT. Retención 2 años.
4. **Los plugins son intercambiables.** Cambiar Stripe por Redsys = activar otro plugin.
5. **Ninguna lógica de negocio en el frontend.** Solo muestra datos y llama a la API.
6. **El schema soporta el futuro.** Multi-moneda · multi-servidor · multi-país.

---

## 4. ARQUITECTURA GENERAL

```
Monolito Modular (NestJS)
No microservicios. Modular por diseño interno.
Escalable horizontalmente cuando se necesite — no antes.

/src
  /modules        ← lógica de negocio por dominio
  /plugins        ← integraciones intercambiables
  /core           ← bus de eventos · config · database · queue
  /common         ← utilidades compartidas

/frontend (Next.js)
  /app            ← páginas y rutas
  /components     ← UI reutilizable
  /lib            ← llamadas a la API
```

### Módulos del core (siempre activos, no desactivables)
- **auth** — autenticación, roles, sesiones, 2FA
- **clients** — ficha del cliente, CRM, contexto del negocio
- **billing** — facturas, suscripciones, ciclos, renovaciones
- **products** — catálogo, configuración, pricing
- **provisioning** — orquestación del ciclo de vida de servicios
- **support** — chat, conversaciones, tickets internos
- **tasks** — tareas automáticas y manuales del equipo
- **notifications** — sistema de eventos y despacho por canal
- **audit** — audit log global e inmutable
- **infrastructure** — registro de servidores y pools

### Sistema de plugins (intercambiables, activables/desactivables)
```
/plugins
  /payment
    /stripe         ← activo
    /redsys         ← futuro
  /provisioners
    /enhance-cp     ← hosting web
    /resellerclub   ← dominios
    /docker-engine  ← contenedores (Nextcloud, OpenClaw, etc.)
    /manual         ← productos sin provisioning automático
  /notification-channels
    /email          ← activo (nodemailer + SMTP configurable)
    /whatsapp       ← futuro (proveedor por definir)
    /sms            ← futuro
  /ai-providers
    /claude         ← activo (Claude API de Anthropic)
```

---

## 5. ROLES Y AUTENTICACIÓN

### Roles del sistema
| Rol | Acceso |
|-----|--------|
| `superadmin` | Todo. Configuración del sistema, productos, agentes, infraestructura |
| `agent_full` | Soporte + facturación. Sin configuración del sistema |
| `agent_billing` | Facturas, pagos, clientes. Sin soporte ni configuración |
| `agent_support` | Chat, conversaciones, historial cliente. Sin facturación |
| `client` | Su propio dashboard: servicios, facturas, conversaciones |

### Reglas de autenticación
- Auth unificado. Un solo sistema de login para todos los roles.
- El rol determina qué ve y qué puede hacer cada usuario.
- La ruta `/admin` no existe públicamente.
- El rol `superadmin` solo se asigna desde la base de datos directamente — nunca desde la UI.
- **2FA obligatorio** para superadmin y todos los agentes. Método: código por email.
- Los agentes no pueden escalar sus propios permisos.

---

## 6. CATÁLOGO DE PRODUCTOS

### Principio fundamental
Catálogo 100% dinámico. Ningún producto hardcodeado.
Todo se crea y configura desde el dashboard por el superadmin.

### Tipos de producto actuales
```
hosting_web       → driver: enhance_cp
domain            → driver: resellerclub
docker_service    → driver: docker_engine (contenido agnóstico)
support_addon     → driver: internal (activación interna)
manual_service    → driver: manual (desarrollo web, etc.)
```

### Configuración de un producto (tres bloques)

**Bloque 1 — Presentación**
Nombre · descripción · precio · ciclos de facturación · imagen
características visibles · badge · orden en catálogo

**Bloque 2 — Provisioning**
Driver asignado · parámetros del driver · tiempo máximo de provisioning
acción si falla (reintentar / alerta admin) · plantilla .yaml (si es Docker)

**Bloque 3 — Reglas de negocio**
¿Requiere dominio al contratar? · ¿Es addon de otro producto?
¿Límite de cantidad? · ¿Período de prueba?
¿Qué pasa al cancelar? (suspender / eliminar / conservar X días)
Checklist base de mantenimiento (si aplica)
Eventos de audit log del servicio y sus campos (ver sección 13)
Bloques custom de API para métricas en el panel del cliente (si es Docker)

### Ciclos de facturación
- Mensual y anual como base.
- Descuento por pago anual: configurable por producto (porcentaje o precio fijo).
- Renovación en la fecha de aniversario del servicio — nunca en fecha fija global.

### Productos actuales del catálogo de Aelium
```
HOSTING WEB B2C
  Web Inicio · Web Pro · Web Business

HOSTING AGENCY B2B
  Agency Starter · Agency Pro · Agency Elite
  White-label: Enhance CP con subdominio personalizado de la agencia
  Soporte: a la agencia, nunca al cliente final de la agencia

DOMINIOS
  Producto independiente (se puede comprar solo)
  Regalo primer año con cualquier plan de hosting anual
  Renovación de pago a partir del año 2 — sin letra pequeña

CLOUD OFFICE (Nextcloud · Docker)
DOCKER SERVICE (OpenClaw y futuros · Docker)
SUPPORT INSIDE (addon global · ver sección 7)
WE DO IT FOR YOU (addon por producto · ver sección 8)
DESARROLLO WEB (manual · sin provisioning automático)
```

---

## 7. SUPPORT INSIDE

### Naturaleza del producto
- Addon global de cuenta del cliente.
- Requiere al menos un producto activo para poder contratarlo.
- El plan define el nivel de soporte reactivo y los canales disponibles.
- Los slots de mantenimiento son independientes del plan y se contratan aparte.
- Nombres definitivos de los planes: se crean desde el dashboard (no hardcodeados).
- SLA exactos: se definen con los primeros clientes reales.

### Soporte sin Support Inside (base para todos los clientes)
- Soporte al hosting/servidor únicamente. No se entra en la web ni en el producto final.
- Asesoramiento pasivo. No se ejecuta nada dentro de su servicio.
- Webchat disponible con **filtro de IA primero**.
  - La IA tiene acceso al contexto del cliente (servicios, plan, historial).
  - La IA no finge ser humana. El cliente sabe que es IA. Transparencia total.
  - Si la IA no resuelve → escala a agente real en el chat.
  - Si el problema se alarga → pasa a conversación asíncrona con contexto completo del chat.
- Teléfono disponible (soporte según plan base).

### Plan Básico
- Agente real de primeras en el webchat. Badge "Support Inside" visible.
- Acceso dentro de la web/producto del cliente para tareas básicas.
  (DNS, instalar WordPress, recomendar plugins, configuraciones básicas)
- Canales: webchat · conversación asíncrona · email · teléfono.
- Slots de mantenimiento proactivo: 0 incluidos. Puede comprar slots de mantenimiento.

### Plan Medium
- Todo lo del Básico.
- Mantenimiento proactivo mensual incluido.
- Canales: todo lo anterior + **WhatsApp**.
- 1 slot de mantenimiento proactivo incluido gratis.
- Puede comprar slots adicionales de mantenimiento.

### Plan Pro
- Todo lo del Medium.
- Soporte proactivo avanzado: detecta necesidades antes que el cliente.
  (Cloudflare si crece el tráfico · CDN · optimizaciones · revisión de métricas)
- Canales: todos + WhatsApp con máxima prioridad.
- 1 slot de mantenimiento + gestión proactiva incluido gratis.
- Puede comprar slots adicionales de tipo mantenimiento o mantenimiento+gestión.

### Sistema de slots

**Slot Mantenimiento**
- Disponible para: Básico, Medium, Pro.
- Cubre: actualizaciones, revisión de backups, SSL, etc. según checklist del producto.
- Precio: X€/slot (definido al crear el producto).

**Slot Mantenimiento + Gestión Proactiva**
- Disponible solo para: Plan Pro.
- Cubre: todo lo del mantenimiento + gestión activa del servicio.
- Siempre van juntos en el mismo slot — no son separables.
- Orientado a negocios complejos que necesitan a alguien encima.
- Precio: Y€/slot (Y > X, definido al crear el producto).

**Reglas de los slots**
- Un slot = un servicio/producto seleccionado por el cliente.
- El cliente selecciona a qué servicio asigna cada slot desde su página de Support Inside.
- Si no tiene servicios al contratar → se le pide que seleccione o cree uno.
- La web con slot activo es visible tanto para el cliente como para el admin (badge).
- El cliente con Support Inside activo tiene badge visible en su ficha y en su cuenta.

### Recurrencia del mantenimiento
- La tarea de mantenimiento se genera el día del mes equivalente a cuando contrató el slot.
  (Contrató el 15 → mantenimiento el 15 de cada mes)
- Esto distribuye la carga de trabajo del equipo a lo largo del mes.
- El mantenimiento corresponde al mes en curso. No se arrastra al siguiente.
- Si la tarea no se completa en su mes → alerta al admin (estado: crítico).
- Alerta de tarea crítica: X días antes de fin de mes si sigue pendiente. X configurable en settings.

### Página de Support Inside del cliente
El cliente tiene una zona específica en su dashboard donde ve:
- Su plan actual y canales disponibles.
- Sus servicios con slot activo: estado · última revisión · próxima revisión.
- Botón para añadir más slots o mejorar el plan.
- Historial de valor: consultas resueltas · tiempo medio de respuesta · soluciones aplicadas · mantenimientos realizados con detalle.
- Medios de contacto disponibles según su plan.

### Support Inside para agencias
- Mismo modelo que B2C.
- Los slots aplican a las webs de los clientes finales de la agencia.
- Soporte siempre a la agencia — nunca contacto directo con el cliente final.

### La IA del Support Inside (copilot para el agente)
- La IA no es para el cliente. Es un copilot interno para el agente humano.
- El agente ve la conversación con el cliente en el panel izquierdo.
- El panel derecho (Support Inside) muestra:
  - Ficha completa del cliente (servicios, facturas, historial, notas, contexto del negocio).
  - Sugerencia de respuesta generada por la IA.
    - Usa: contexto del cliente + documentación interna + voz de marca Aelium.
    - El agente puede: Usar · Editar · Ignorar.
- El cliente nunca sabe que hay IA. Solo ve respuestas humanas, rápidas y contextualizadas.
- El acceso de la IA al contexto del cliente queda registrado en el audit log. Siempre.

---

## 8. WE DO IT FOR YOU

- Addon por producto. Cada producto define lo que incluye.
  - Hosting web → creación de la web.
  - Cloud Office → configuración y organización completa del Nextcloud.
  - Futuros productos → definen su propio alcance.
- El cliente puede añadir una nota opcional al contratar.
- El sistema genera una tarea para el agente asignado.
- El agente contacta al cliente por su canal preferido para acordar fecha y hora.
- La fecha acordada queda registrada en la tarea.

---

## 9. SISTEMA DE COMUNICACIÓN

### Los canales
```
Webchat (tiempo real)       → todos los clientes
Conversación asíncrona      → todos los clientes (tipo email interno)
Email                       → todos los clientes
Teléfono                    → todos los clientes
WhatsApp                    → Support Inside Medium y Pro
```

### El chat en tiempo real
- Tecnología: WebSockets con Socket.io.
- Disponible en la landing (anónimos y clientes) y en el dashboard (clientes logueados).
- Chat anónimo en landing: solicita nombre y email mínimo.
  - Si el anónimo se registra con el mismo email → el historial se vincula automáticamente.
  - Si no dejó email → la conversación queda huérfana, el agente puede vincularla manualmente.
- Clientes logueados: el agente ve el contexto completo del cliente mientras chatea.

### Las conversaciones asíncronas
- Nombre interno para el equipo: "Casos".
- Nombre visible para el cliente: "Conversaciones".
- Si un chat en tiempo real se complica o alarga → pasa a conversación asíncrona.
  - El contexto completo del chat se transfiere automáticamente.
  - El cliente recibe notificación: "Tu consulta sigue en curso".
- Funcionan como un email interno con historial y contexto.
- Tienen prioridades (configurable).
- Se usan también para comunicaciones más lentas: desarrollo web, proyectos, etc.

### El filtro de IA para clientes sin Support Inside
```
Cliente escribe en el chat
         ↓
IA intenta resolver (con acceso al contexto del cliente)
Visible para el cliente: "Estás siendo atendido por IA"
         ↓
¿Resuelto? → conversación cerrada
¿No resuelto? → escala a agente real
¿Se alarga? → pasa a conversación asíncrona con contexto
```

### Organización del soporte sin vs con Support Inside
```
SIN SUPPORT INSIDE
  Webchat: filtro IA → agente si necesario
  Sin SLA garantizado

CON SUPPORT INSIDE BÁSICO
  Webchat: agente real de primeras
  Badge "Support Inside" visible en el chat
  SLA según plan (por definir con primeros clientes)

CON SUPPORT INSIDE MEDIUM
  Todo lo anterior + WhatsApp
  SLA más bajo

CON SUPPORT INSIDE PRO
  Todo lo anterior + WhatsApp con máxima prioridad
  SLA mínimo
```

---

## 10. SISTEMA DE TAREAS

### Principio
Las tareas se generan automáticamente por el sistema según eventos.
También se pueden crear manualmente.
La asignación es por cliente completo — un agente es responsable del cliente entero.

### Tipos de tarea y su trigger
```
wow_call              → cliente nuevo compra su primer producto
                        Plazo: 24 horas
maintenance           → slot de mantenimiento activo
                        Recurrencia: mensual en fecha de aniversario
maintenance_mgmt      → slot mantenimiento+gestión activo
                        Recurrencia: mensual en fecha de aniversario
we_do_it_for_you      → cliente contrata el addon
                        Tarea única con nota del cliente si la hay
custom_service        → cualquier servicio manual
                        El admin la crea manualmente
```

### Estados de una tarea
`pending` → `in_progress` → `completed` / `not_completed_in_time`

### Al completar una tarea de mantenimiento
El agente ve una pantalla con:
1. **Checklist del servicio** (heredado del producto, personalizable por servicio concreto).
2. **Notas para el cliente** (van al email / WhatsApp / notificación interna).
3. **Notas internas** (solo visibles para el equipo, quedan en la ficha del cliente).
4. **Canales de notificación** (el sistema muestra cuáles corresponden según el plan del cliente).
5. Botón: "Completar y notificar".

Al completar → dispara evento `maintenance.completed` → notificación al cliente.

### El checklist
- Se define como base al crear el producto.
- Se puede personalizar por servicio concreto de un cliente.
- Cada tipo de producto tiene su propio checklist base.
  - Hosting web: actualizar plugins, core, SSL, backup, etc.
  - Cloud Office: verificar backups, consumo, usuarios, apps, etc.

### Panel de tareas del agente
```
HOY
  🔴 Tarea crítica · mantenimiento · empresa.com · Juan García
  ☎️  Llamada WOW · Pedro Sánchez · nuevo cliente

ESTA SEMANA
  🔧 Mantenimiento · tienda.com · María López
  🛠️  We Do It For You · Nextcloud · Agencia Norte

PRÓXIMAMENTE
  🔧 Mantenimiento+Gestión · web.com · Carlos Ruiz
```

El superadmin ve todas las tareas de todos los agentes con filtros y puede reasignar.

---

## 11. SISTEMA DE NOTIFICACIONES

### Principio
Cada evento del sistema puede activar múltiples canales de notificación.
Los módulos emiten eventos — el módulo de notificaciones los escucha y despacha.
El módulo no sabe cómo llega la notificación (eso es el plugin de canal).

### Eventos principales del sistema
```
invoice.created · invoice.paid · invoice.failed · invoice.overdue
service.provisioned · service.suspended · service.cancelled · service.failed
maintenance.completed · maintenance.critical (tarea sin completar cerca del límite)
task.created · task.assigned · task.overdue
ticket.created · ticket.replied · ticket.closed
client.registered · client.wow_pending
```

### Plantillas de notificación
- El admin puede editar asunto y cuerpo de cada plantilla desde el dashboard.
- Editor visual con variables disponibles por evento.
  - Variables ejemplo: `{{client.name}}` · `{{service.name}}` · `{{invoice.amount}}` · `{{maintenance.notes}}`
- El admin puede activar o desactivar cada notificación por canal.
- El admin puede crear nuevas notificaciones asociadas a eventos existentes.
- El admin puede previsualizar antes de guardar.

### Centro de notificaciones interno (dentro del dashboard)
- Campana con contador en la barra superior para cliente y para agente/admin.
- Las notificaciones del cliente son espejo de lo que recibiría por email.
- Las notificaciones del agente/admin son alertas operativas internas.
- Estados: nueva · leída.
- El mismo sistema de eventos activa email + notificación interna simultáneamente.

### Notificaciones críticas de mantenimiento
- X días antes de fin de mes si la tarea sigue pendiente → estado crítico.
- Notificación interna al agente asignado y al admin.
- X configurable en settings globales.

---

## 12. FACTURACIÓN

### Configuración fiscal
- Autónomo · España · IVA 21% por defecto.
- Apartado de fiscalidad en la página de configuración extensa.
- Multi-moneda soportado en el schema desde el día uno. Activo: EUR.
- Clientes extranjeros: no en el corto plazo. El schema lo soporta para el futuro.

### Facturas
- Generadas automáticamente X días antes del vencimiento. X configurable en settings.
- PDF generado automáticamente con logo y datos personalizables.
- Plantilla de factura PDF personalizable desde el dashboard.
- Numeración: secuencial por año. Prefijo y sufijo configurables (fijos y con variables).
  - Ejemplo: `AELIUM-2026-0042` o `2026/0042`.
  - Siempre secuencial — nunca saltos en la numeración.
- El admin puede crear facturas manuales.

### Ciclo de cobro
```
X días antes del vencimiento → factura generada
En fecha de vencimiento → intento de cobro via plugin de payment activo
Si falla → reintento en X días (configurable)
           máximo Y reintentos (configurable)
Si agota reintentos → evento invoice.failed
                      servicio pasa a suspendido
```

### Suspensión y cancelación por impago
- Días de margen antes de suspender: configurable en settings.
- Días hasta cancelación definitiva tras suspensión: configurable.
- Datos del servicio (no del cliente como usuario) se conservan X días tras suspensión: configurable.

### Flujo de compra del cliente
```
1. Registro rápido: nombre · email · contraseña
2. Explorar el dashboard
3. Al ir a pagar → datos de facturación
   NIF/CIF · dirección · país · particular o empresa
4. Pago
5. Servicio activo + email de confirmación
```
Los datos de facturación solo se piden en el momento que tienen sentido: antes de pagar.

---

## 13. AUDIT LOG

### Audit log global del cliente
Registra accesos y cambios sobre la cuenta general del cliente.

**Tabla: `audit_access_log`**
- Quién vio la ficha del cliente · cuándo · desde qué origen (ticket, tarea, acceso directo).

**Tabla: `audit_change_log`**
- Qué campo cambió · valor anterior · valor nuevo · quién lo hizo · cuándo.

**Tabla: `audit_integration_log`**
- Qué datos salieron a qué servicio externo · cuándo.

**Reglas de las tablas de audit**
- Solo INSERT. Nunca UPDATE ni DELETE. Ni el superadmin puede borrar.
- Viven en un schema separado de la base de datos principal.
- Retención: 2 años. Borrado automático al cumplirse.
- El cliente ve en su portal de transparencia: nombre real del agente + rol.

### Audit log del servicio (por producto contratado)
Específico de cada servicio del cliente. El cliente lo ve dentro de la gestión de ese servicio.

**Tabla: `audit_service_log`**
```
id
service_id
tipo_accion        → definido al crear el producto
actor_id           → agente o sistema
actor_nota         → nota opcional del agente (visible al cliente)
timestamp
metadata           → JSON flexible · campos definidos por tipo de producto
```

**El campo `metadata` es JSON libre.**
Cada tipo de producto define sus propios eventos y campos al crearse en el dashboard.
Añadir un producto nuevo no requiere modificar la tabla — solo definir sus eventos.

**Ejemplo de definición de evento al crear un producto:**
```
Producto: Cloud Office (Nextcloud)

Evento: "contenedor_actualizado"
Descripción para el cliente: "Tu servicio fue actualizado"
Campos:
  version_anterior → "Versión anterior"
  version_nueva    → "Nueva versión"

Evento: "acceso_agente"
Descripción para el cliente: "Un agente de Aelium accedió"
Campos:
  agente_nombre  → "Agente"
  agente_rol     → "Rol"
  nota           → "Motivo"
  tarea_id       → "Relacionado con"
```

**Acceso de agentes al servidor/servicio**
- Se registra automáticamente en el audit log del servicio.
- El agente tiene opción de añadir nota del motivo (opcional).
- Si el acceso viene de una tarea → se vincula automáticamente a esa tarea.

### Portal de transparencia del cliente
El cliente tiene una zona específica en su dashboard con:
- Historial de accesos a su ficha (quién · cuándo · desde qué origen).
- Historial de cambios en sus datos (qué cambió · quién · cuándo).
- Integraciones externas activas (qué servicio tiene sus datos · qué datos · dónde).
- Exportación de todos sus datos (portabilidad RGPD).
- Solicitud de eliminación de cuenta (genera tarea interna → anonimización, no borrado).
- Audit log de cada servicio contratado (dentro de la gestión de ese servicio).

**Transparencia por servicio incluye:**
- Ubicación exacta del servidor: proveedor · ciudad · datacenter.
- Quién ha accedido · cuándo · motivo.
- Cambios de configuración y recursos.
- Estado de backups (solo visualización · el sistema de backups es externo al dashboard).

---

## 14. INFRAESTRUCTURA Y SERVIDORES

### Registro de servidores
El admin registra un servidor introduciendo:
```
Nombre interno       → identificación para el equipo
IP principal
Método de conexión   → Docker API (preferido) o SSH
Credenciales         → guardadas encriptadas
Proveedor            → Hetzner · OVH · Contabo · etc.
Ubicación            → país · ciudad · datacenter
```
La **capacidad total** (RAM, CPU, disco) la detecta el sistema automáticamente
al conectarse al servidor. No se introduce manualmente.

### Estado del servidor (calculado automáticamente)
```
RAM usada    = suma de RAM asignada a contenedores activos en ese servidor
CPU usada    = suma de CPU asignada
Disco usado  = suma de almacenamiento asignado
Disponible   = Total (detectado) - Usado (calculado)
```

### Margen de seguridad (configurable en settings)
El sistema nunca asigna más del X% de capacidad de un servidor.
Por defecto: RAM 80% · CPU 80% · Disco 90%.
Cuando un servidor supera su límite configurado:
- No se le asignan nuevas instancias.
- Alerta al admin via notificación interna.
- El sistema busca otro servidor disponible del mismo pool.

### Pools de servidores por producto
La exclusividad no se define al registrar el servidor.
Se define al crear o editar un producto, en la sección de servidores del pool.

```
Estados de un servidor:
  LIBRE      → recién registrado, sin producto asignado
  COMPARTIDO → asignado a un producto sin exclusividad
  EXCLUSIVO  → ligado a un producto, no aparece disponible en otros
```

Al añadir un servidor al pool de un producto:
- Checkbox: "Reservar exclusivamente para este producto".
- Si se marca → el servidor queda ligado y no aparece al crear otros productos.
- Si no se marca → podría asignarse a otros productos (decisión del admin).

Cuando llega una orden de provisioning:
```
Sistema identifica el pool de servidores del producto
         ↓
Filtra los disponibles (por debajo del margen de seguridad)
         ↓
Selecciona el de menor carga
         ↓
Despliega la instancia
         ↓
Si todos los servidores del pool superan el límite
→ alerta al admin: "Pool de [producto] casi lleno"
```

### Provisioning Docker
- Las plantillas `.yaml` viven en el dashboard (gestionadas solo por el superadmin).
- Al provisionar: el sistema inyecta las variables del cliente en la plantilla.
- El archivo `docker-compose.yml` generado se envía al servidor seleccionado.
- El sistema ejecuta `docker-compose up` en ese servidor.
- Configura el proxy inverso (Traefik recomendado) para el subdominio.
- Provisiona SSL automático via Let's Encrypt.

**Variables que se inyectan en la plantilla:**
`SUBDOMINIO` · `RAM` · `CPU` · `STORAGE` · `DB_NAME` · `DB_PASSWORD` · `ADMIN_PASSWORD` · las que defina el admin al crear el producto.

**Subdominios del cliente:**
```
Con dominio registrado en Aelium:
  → El cliente elige el prefijo: [prefijo].sudominio.com

Sin dominio propio:
  → El cliente elige solo el nombre: [sunombre].cloud.aelium.net
```

**Collabora (caso especial):**
Una sola instancia en servidor dedicado compartida por todos los Nextcloud.
No se provisiona por cliente — se configura una vez.
En la plantilla de Nextcloud: variable `COLLABORA_URL` apunta al servidor de Collabora.

### Panel de infraestructura (solo admin)
```
INFRAESTRUCTURA — VISIÓN GLOBAL

servidor-docker-1  [████████░░] 78% · 23 instancias · ⚠️ Casi lleno
servidor-docker-2  [███░░░░░░░] 31% · 8 instancias  · ● Disponible
servidor-collab-1  [██░░░░░░░░] 18% · Collabora     · ● Dedicado
```

### Métricas del producto Docker para el cliente
**Bloque de infraestructura** (siempre disponible, igual para todos los productos Docker):
CPU · RAM · disco · estado del contenedor · uptime.

**Bloques custom de API** (opcionales, configurados al crear el producto):
- El admin define: endpoint de la API interna del contenedor · método · autenticación · mapeo de campos · frecuencia de actualización.
- Aplican a todos los clientes de ese producto.
- Ejemplo para Nextcloud: usuarios conectados · archivos compartidos · última actividad.

**Acciones disponibles para el cliente sobre su contenedor:**
Reiniciar · Ver credenciales · Ver transparencia (audit log del servicio).

### Funciones fuera del dashboard (por ahora)
- Backups: sistema externo a nivel de servidor. Solo se muestra la info en el dashboard.
- Migración entre servidores: manual. El schema lo soporta (campo `server_id` en el servicio).
- Orquestación avanzada (Kubernetes): futuro. El plugin evoluciona, el core no cambia.

---

## 15. GESTIÓN DE CLIENTES (CRM)

### Ficha del cliente (lo que ve el agente)
```
Cabecera:
  Nombre · Email · Plan · Badge Support Inside (si tiene)

Datos básicos + facturación:
  NIF/CIF · dirección · tipo (particular/empresa)

Contexto del negocio (campo libre editable por el equipo):
  "Qué hace su negocio" · notas internas · etiquetas

Servicios activos:
  Cada servicio con su estado · badge de slot activo si aplica

Historial completo de interacciones:
  Chats · conversaciones · llamadas (registro manual) · emails

Estado de onboarding:
  Tarea WOW completada o pendiente

Alertas proactivas (generadas automáticamente):
  Dominio expira en X días
  Factura próxima a vencer
  Lleva X días sin usar su Nextcloud
```

### Organización de servicios por el cliente
- Los servicios se ven siempre individualmente, nunca agrupados por defecto.
- El cliente puede crear carpetas y etiquetas opcionales para organizar sus servicios.

### Onboarding
- Al registrarse: el cliente ve su dashboard completo desde el primer acceso.
- Tarea WOW generada automáticamente para el agente: llamada de bienvenida en 24h.
- Al contratar un producto con slot de mantenimiento: se le pide que seleccione o cree el servicio a asignar.

---

## 16. INTEGRACIÓN CON LA LANDING

- La landing está en Next.js (en desarrollo, actualmente en localhost).
- Se comunica con el dashboard via la API del backend.
- La landing nunca tiene lógica de negocio — solo llama a la API.
- Funciones que conectan landing con dashboard:
  - Buscador de dominios → API ResellerClub via backend.
  - Catálogo de productos y precios → API del dashboard.
  - Proceso de compra y checkout → API del dashboard.
  - Webchat → mismo sistema de chat, el cliente puede ser anónimo.
  - Formulario de contacto → genera conversación en el dashboard.

---

## 17. CONFIGURACIÓN EXTENSA (SETTINGS)

Página de configuración del superadmin. Toda la lógica de negocio configurable vive aquí.
Organizada por secciones:

```
FACTURACIÓN
  Días de antelación para generar factura de renovación
  Número máximo de reintentos de cobro fallido
  Días entre reintentos
  Días de margen antes de suspender por impago
  Días hasta cancelación tras suspensión
  Días de retención de datos del servicio tras suspensión
  Formato de numeración de facturas (prefijo · sufijo · variables)
  Configuración fiscal (IVA · tipo de autónomo/empresa)

INFRAESTRUCTURA
  Margen de seguridad por tipo de recurso (RAM · CPU · Disco) en %

SOPORTE Y TAREAS
  Días de alerta antes de fin de mes para tareas críticas

NOTIFICACIONES
  Activar/desactivar cada evento por canal
  Editar plantillas de email con variables
  Configurar canales activos

PLUGINS
  Activar/desactivar plugins
  Configurar cada plugin activo (claves API · credenciales · modo test/producción)

MARCA
  Logo · colores · datos de empresa para facturas
  Plantilla PDF de facturas

USUARIOS Y ROLES
  Gestión de agentes (crear · editar · desactivar)
  Asignación de roles
```

---

## 18. ORDEN DE CONSTRUCCIÓN (SPRINTS)

```
SPRINT 1 — Core que desbloquea todo
  Auth + roles + 2FA por email
  Estructura de módulos vacíos en NestJS
  Schema de base de datos base
  Frontend: layout base + login

SPRINT 2 — El flujo de dinero
  Módulo de productos + catálogo
  Módulo de billing + Stripe (plugin)
  Generación de facturas PDF
  Frontend: dashboard cliente básico · servicios · facturas

SPRINT 3 — El flujo de servicios
  Módulo de provisioning
  Plugin Enhance CP (hosting)
  Plugin ResellerClub (dominios)
  Plugin Docker Engine (contenedores)
  Cola de trabajos BullMQ
  Sistema de notificaciones + email

SPRINT 4 — El soporte
  Chat en tiempo real (Socket.io)
  Conversaciones asíncronas
  Módulo de tareas
  Support Inside (lógica de slots + mantenimiento)
  We Do It For You
  Integración Claude API (filtro IA + copilot agente)

SPRINT 5 — La transparencia y el CRM
  Audit log global (cliente)
  Audit log del servicio (por producto)
  Portal de transparencia del cliente
  Centro de notificaciones interno
  CRM completo (ficha del cliente · contexto · historial)

SPRINT 6 — Infraestructura y servidores
  Plugin Docker Engine completo
  Panel de infraestructura (admin)
  Registro y monitorización de servidores
  Bloques custom de API para productos Docker

SPRINT 7 — Pulido y escalabilidad
  Integración completa con la landing
  Optimización de rendimiento
  Tests de carga
  Documentación interna de soporte (base de conocimiento)
```

---

## 19. CATÁLOGO — CATEGORÍAS Y EXTRAS

### Categorías y subcategorías
- El admin crea categorías y subcategorías libremente desde el dashboard. Son opcionales.
- Al crear un producto, puede asignarlo a una categoría/subcategoría o dejarlo sin categoría.
- Las categorías tienen orden configurable (número de orden o drag and drop).
- Los productos dentro de cada categoría también tienen orden configurable.
- En la landing y en el catálogo público, las categorías estructuran la navegación.

### Sistema de extras por producto (upsell y crossell)
**Pendiente de razonar en detalle.** Decisiones base confirmadas:
- Al crear un producto, el admin puede añadir extras vinculados.
- Un extra puede ser: descuento en otro producto, producto gratis por tiempo limitado.
- Cada extra tiene su propia configuración: duración · precio · restricciones · límite de valor.
- El dominio regalo el primer año con hosting anual es un extra configurable, no hardcodeado.
  - TLD elegibles: configurable.
  - Valor máximo del dominio regalo: configurable.
  - Duración de la gratuidad: configurable.
- El sistema de upsell y crossell afecta el proceso de compra (landing + checkout) y el dashboard del cliente (post-compra).
- **Pendiente:** razonar el flujo completo de upsell/crossell antes del Sprint 2.

---

## 20. REGISTRO, AUTENTICACIÓN Y SEGURIDAD

### Registro de clientes
- Registro público abierto. Cualquiera puede crear una cuenta.
- El proceso de compra incluye registro si el cliente no tiene cuenta.
- Cambio de rol cliente → agente: solo el superadmin puede hacerlo manualmente desde el dashboard.

### Verificación de email
- Configurable en settings: activar/desactivar verificación.
- Días para verificar: configurable.
- Si no verifica en el plazo: cuenta queda en estado pendiente.
- Al intentar hacer login con cuenta pendiente: aviso claro + opción de reenvío del email de verificación.

### Seguridad de sesiones
- Límite de intentos de login fallidos: 5 intentos.
- Tras 5 intentos fallidos: cuenta bloqueada + email automático para cambiar contraseña.
- Duración del bloqueo: hasta que el cliente cambie su contraseña.
- Expiración de sesión por inactividad: configurable en settings.
  - Default clientes: 30 días.
  - Default agentes y admin: 8 horas.
- El admin puede cerrar sesiones activas de cualquier usuario desde el dashboard.

---

## 21. SUSCRIPCIONES — CICLO DE VIDA AVANZADO

### Período de gracia
- Configurable por producto.
- Días de margen tras la fecha de vencimiento antes del primer intento de cobro.

### Pausar suscripción
- El cliente puede suspender su suscripción voluntariamente.
- El servicio y sus datos se conservan durante X días (configurable por producto).
- Misma lógica que la suspensión por impago — el producto queda congelado en su estado actual.

### Cambio de plan (mensual ↔ anual) y prorrateo
- El cliente puede cambiar de ciclo en cualquier momento.
- Cálculo del prorrateo:
  - Se calcula el precio diario del plan actual (precio del período / días del período).
  - Los días no consumidos del período actual generan un crédito.
  - El crédito se descuenta del nuevo plan — nunca se devuelve dinero.
  - Todo el cálculo es visible y transparente para el cliente antes de confirmar.
- Ejemplo: cliente tiene Web Pro mensual, lleva 15 días de 30. Cambia a anual.
  - Crédito: 15 días × precio diario mensual.
  - Se descuenta del precio anual.
  - Paga la diferencia.

---

## 22. CHAT Y ATENCIÓN AL CLIENTE — CONFIGURACIÓN

- Horario de atención: configurable en settings (días y franjas horarias).
- Fuera de horario: el chat muestra la última vez que un agente estuvo online (no "cerrado").
- Tiempo máximo de respuesta: configurable y visible para el cliente en el chat.
- Mensaje de bienvenida del chat: configurable en settings.
- La IA escala a agente humano en el momento que el cliente lo solicita. Sin límite de intentos previos.

---

## 23. RGPD, PRIVACIDAD Y RETENCIÓN DE DATOS

### Textos legales
- Política de privacidad: editable desde el dashboard por el superadmin.
- Términos y condiciones: editables desde el dashboard.

### Retención de datos (defaults configurables salvo indicación)

| Tipo de dato | Retención | Acción al cumplirse | Configurable |
|---|---|---|---|
| Conversaciones cerradas | 2 años | Anonimización | Sí |
| Audit log | 2 años | Borrado automático | No (ya decidido) |
| Datos cuenta cliente eliminado | 5 años | Registro anonimizado | Sí |
| Facturas | 10 años | No se borran | No (obligación Hacienda España) |

### Integraciones externas en el portal de transparencia
- El registro de accesos de integraciones externas es **automático e inmutable**.
- El admin no puede añadir ni quitar entradas del registro.
- Lo que sí gestiona el superadmin: el **catálogo de descripciones públicas** de cada integración.
  - Descripción legible para el cliente.
  - Qué datos accede cada integración.
  - Ubicación geográfica y cumplimiento RGPD.
  - URL de política de privacidad del proveedor.
- El cliente ve solo las integraciones que realmente han accedido a sus datos.

---

## 24. INFRAESTRUCTURA — DECISIONES ADICIONALES

### Capacidad del servidor
- La capacidad total (RAM, CPU, disco) **no se introduce manualmente**.
- El sistema la detecta automáticamente al registrar el servidor via Docker API o SSH.
- Los recursos usados se calculan como suma de los recursos asignados a contenedores activos.
- `Disponible = Total detectado - Asignado calculado`

### Escalabilidad horizontal
- La arquitectura está diseñada para escalar horizontalmente, no verticalmente.
- La API (NestJS) es stateless — el estado vive en PostgreSQL y Redis, no en el servidor.
- Añadir más instancias de la API o más workers no requiere cambios de código.
- La cola BullMQ es compartida via Redis — cualquier worker puede ejecutar cualquier job.

### Productos Docker
- El sistema soporta cualquier número de productos Docker con plantillas .yaml distintas.
- El contenido del contenedor es agnóstico para el sistema — el .yaml define todo.
- Añadir un producto Docker nuevo = subir .yaml + crear producto en el catálogo. Sin código.

---

## 25. MÓDULO DE PROMOCIONES Y EXTRAS

### Separación de sistemas

**Extras** — módulo de producto
- Vinculados a un producto · configurados al crearlo.
- Pueden ser obligatorios (siempre incluidos) u opcionales (el cliente acepta o rechaza).
- Se activan en el momento de compra · nunca después.
- Ejemplo obligatorio: dominio gratis incluido con hosting anual.
- Ejemplo opcional: SSL adicional por X€ (checkbox en el checkout).

**Promociones** — módulo propio
- Siempre opcionales · nunca obligatorias.
- Generan mensajes contextuales accionados por eventos o momentos.
- Upsell: ofrecer una versión mejor del mismo producto.
- Crossell: ofrecer un producto diferente complementario.

**Cupones y descuentos** — pendiente de razonar.

---

### Los tres momentos de una promoción

**Antes del checkout**
- Una sola sugerencia · nunca lista de opciones.
- El cliente acepta con un clic · nunca retrasa el proceso de pago.

**Después del checkout**
- Una sola sugerencia en la página de confirmación.
- Momento de mayor receptividad.

**En el dashboard**
- Accionado por eventos reales del cliente · nunca por tiempo arbitrario.
- Notificación interna (campana) con mensaje contextual.
- Banner sutil solo dentro de la página del servicio afectado.
- Nunca en la página principal del dashboard.

---

### Comportamiento para el cliente

- Dos botones: "No mostrar más" + CTA de acción.
- Si el cliente no acepta tras X visualizaciones → no se muestra más. X configurable.
- Opción C: desaparece sola en X días Y el cliente puede descartarla antes.
- En preferencias de usuario: opción para desactivar todos los mensajes promocionales.
- Si hay varias promociones activas para el mismo sitio → se rotan.

---

### Si el cliente acepta una promoción
- Va directamente al checkout con el producto preseleccionado.
- El descuento configurado se aplica automáticamente. Sin cupones manuales.

---

### Configuración de una regla de promoción

```
TIPO
  ○ Upsell (mismo producto · mejor plan)
  ○ Crossell (producto diferente · complementario)

TRIGGER
  Nivel 1: momento fijo (checkout · post-checkout · dashboard)
  Nivel 2: evento del cliente (uso X% · N conversaciones · etc.)
  El dato del evento debe ser real y obtenido automáticamente

CONDICIONES
  ├── El cliente tiene el producto: [selector]
  ├── El cliente NO tiene el producto: [selector]
  ├── El plan del cliente es: [selector]
  ├── Solo si compra ciclo: [mensual / anual / ambos]
  └── Válida hasta: [fecha opcional]

PRODUCTO OFRECIDO
  [selector del catálogo]

INCENTIVO (opcional)
  ○ Sin incentivo
  ○ Descuento: X% durante Y meses (se aplica automáticamente al aceptar)
  ○ Gratis durante: Y meses
  ○ Límite de valor: X€ máximo
  ○ Límite de usos: N clientes

MENSAJES (uno por ubicación · el contexto importa)
  ├── Mensaje checkout
  ├── Mensaje post-checkout
  ├── Mensaje notificación interna
  └── Mensaje banner en página del servicio
  Variables: {{client.name}} · {{service.name}} · {{usage.storage_percent}} · etc.

ROTACIÓN Y CADUCIDAD
  ├── Fecha de desactivación automática: [opcional]
  ├── Desactivación manual por el admin: siempre disponible
  ├── Rotación con otras promociones activas en el mismo sitio
  └── Máximo de visualizaciones antes de ocultar: [configurable]
```

---

### Los tres niveles del sistema

```
NIVEL 1 — Simple (lanzamiento)
  Reglas fijas por producto · triggers por momento de compra

NIVEL 2 — Contextual (fase 2)
  Reglas basadas en eventos reales del cliente
  Mensaje personalizado con variables del contexto

NIVEL 3 — Inteligente con IA (futuro)
  La IA sugiere reglas al admin · el admin aprueba
  La IA nunca actúa sola
```

---

### Métricas de uso como trigger (nivel 2)
- El dato debe ser real y obtenido automáticamente del sistema.
- El sistema almacena periódicamente las métricas de uso por servicio.
- Las reglas consultan datos almacenados · no en tiempo real.
- Cómo se obtiene por tipo de producto: pendiente de valorar al implementar cada plugin.

---

## 26. CONSENTIMIENTO DE DATOS Y ANALÍTICAS

### Preferencias de privacidad del cliente

```
INTEGRACIONES TÉCNICAS NECESARIAS (no desactivables)
  Stripe · ResellerClub · Enhance CP · Docker API
  Sin estas el servicio no puede funcionar

ANALÍTICAS DE USO INTERNO (opt-in/opt-out)
  Cómo usa el cliente el dashboard · solo para Aelium · nunca a terceros

ANALÍTICAS DE TERCEROS (opt-in/opt-out)
  Google Analytics u similar
  Si el cliente opta out → el sistema NO envía sus datos
  Queda registrado en el audit log de integraciones
```

### Validación del consentimiento
- Antes de enviar datos a cualquier integración no esencial, el sistema valida el consentimiento.
- Si no hay consentimiento → los datos no se envían.
- El intento y la validación quedan registrados en el audit log.
- Las integraciones técnicas necesarias no pasan por esta validación.

---

## 27. CONFIGURACIÓN DE TIPOS DE PRODUCTO

### Bloques comunes a todos los productos
```
BLOQUE IDENTIDAD
  Nombre · descripción · categoría/subcategoría · precio
  Ciclos de facturación · imagen · badge · orden · activo/inactivo

BLOQUE REGLAS DE NEGOCIO
  ¿Requiere producto activo previo?
  ¿Es addon de otro producto?
  Período de gracia antes del primer cobro
  Días margen por impago antes de suspender
  Días hasta cancelación tras suspensión
  Retención de datos del servicio tras cancelación
  ¿El cliente puede pausar este servicio?

BLOQUE EXTRAS
  Extras opcionales u obligatorios vinculados al producto

BLOQUE CHECKLIST DE MANTENIMIENTO
  Items editables que heredan los slots de mantenimiento
  Específico por tipo de producto

BLOQUE AUDIT LOG DEL SERVICIO
  Tipos de evento y sus campos (metadata JSON)
  Específico por tipo de producto
```

### Bloque provisioner — pendiente por plugin
El bloque de configuración del provisioner se define al trabajar cada plugin.
Los campos varían según el provisioner. No se generaliza.
Cada plugin tiene su propio documento de especificación.

### Producto Support Inside
```
BLOQUE CONFIGURACIÓN DEL ADDON
  Nombre del nivel: [libre · lo define el admin]
  Canales disponibles: webchat · conversación · email · teléfono · WhatsApp
  ¿Agente real de primeras? Sí/No
  ¿Acceso dentro del producto del cliente? Sí/No
  ¿Mantenimiento proactivo disponible? Sí/No
  SLA de respuesta: X minutos (visible al cliente)

BLOQUE SLOTS (si mantenimiento disponible)
  Tipo de slot: solo mantenimiento / mantenimiento+gestión
  Slots incluidos gratis: X
  Precio por slot adicional: X€/slot

REGLAS DE SLOTS
  Si se cancela Support Inside → se cancelan todos los slots automáticamente
  Un slot se puede cancelar individualmente sin cancelar Support Inside
  Siempre requiere producto activo previo (siempre)
  Es addon global de cuenta (siempre)
```

### Producto soporte (support_service)
```
  Provisioner: internal
  Configura: niveles · canales · SLA · horarios
  Genera tarea tipo: support_setup al activarse
```

### Producto servicio personalizado (custom_service)
```
  Provisioner: manual
  Configura: descripción · nota del cliente · tiempo estimado · precio
  Genera tarea tipo: custom_work al activarse
  Nota del cliente al contratar: opcional u obligatoria (configurable)
  Canal de contacto para acordar fecha: el que prefiera el cliente
  Tiempo máximo para contactar al cliente: X horas (alerta si se supera)
```

---

## 28. PROVISIONERS — REGLAS DE DESARROLLO

Cada provisioner es un plugin independiente con su propio documento de especificación.
No se generalizan entre sí. Cada uno tiene sus propios campos, lógica, y configuración.

```
PROVISIONERS ACTUALES
├── enhance_cp      ← hosting web · documento propio al desarrollarlo
├── resellerclub    ← dominios · documento propio al desarrollarlo
├── docker_engine   ← contenedores · documento propio al desarrollarlo
├── internal        ← activación interna · marca el servicio como activo en DB
└── manual          ← genera tarea para el agente · el agente activa el servicio

REGLA
  El bloque provisioner de cada producto se define
  al trabajar el plugin correspondiente.
  No antes. No se generalizan campos entre plugins.
```

### Provisioner internal
- No hace llamada a API externa.
- Al pagar → el sistema marca el servicio como activo en la base de datos.
- Uso: Support Inside · addons de cuenta · cualquier producto de activación inmediata.

### Provisioner manual
- Al pagar → el sistema genera una tarea para el agente asignado.
- El agente hace el trabajo fuera del dashboard.
- El agente marca la tarea como completada → el servicio se marca como activo.
- Uso: desarrollo web · configuraciones especiales · servicios personalizados.

---

## 29. AGENTES IA — CONFIGURACIÓN Y ALCANCE

### Agente IA filtro de chat (clientes sin Support Inside)
- Se activa solo cuando el cliente no tiene Support Inside.
- Intenta resolver el problema antes de escalar a agente humano.
- Escala inmediatamente cuando el cliente lo solicita. Sin límite de intentos.
- Contexto que tiene: datos del cliente · servicios · historial · base de conocimiento interna.
- No tiene acceso a APIs externas en tiempo real.
- Es un plugin independiente. Se detalla al desarrollarlo.
- Nivel 1: solo genera texto sugerido. Sin acciones en el sistema.

### Agente IA copilot para agentes humanos
- Disponible siempre para el agente · independientemente del plan del cliente.
- Dos contextos de uso:
  1. **Durante el chat con el cliente:** sugiere respuestas en la voz de Aelium.
     El agente puede: Usar · Editar · Ignorar. Nunca responde sin aprobación.
  2. **Asistencia general al agente:** responde preguntas del agente sobre el sistema,
     le indica dónde ir para hacer X, qué pasos seguir para resolver Y.
     Como una persona al lado que conoce el sistema y el contexto del cliente.
- Contexto que tiene: ficha completa del cliente · historial · base de conocimiento · notas internas · slots activos.
- Nivel 1: solo genera texto y orientación. Sin acciones en el sistema.
- Niveles 2 y 3 (navegar dashboard · ejecutar acciones): futuro · mismo plugin · se amplía.

### Configuración de modelos IA
- El modelo se configura globalmente en Settings → Plugins → AI Providers.
- No se puede cambiar por conversación individual.
- Se puede configurar un modelo distinto para cada rol:
  - Filtro de chat del cliente: modelo más rápido y económico (Sonnet recomendado).
  - Copilot del agente: modelo más preciso y contextual (Opus recomendado).
- Cambiar de proveedor de IA = activar otro plugin. Sin tocar código.

### Base de conocimiento interna
- Solo el superadmin puede editar.
- Contiene: artículos técnicos · políticas de empresa · FAQs · notas de producto.
- Acceso de lectura: agente IA filtro · agente IA copilot · agentes humanos.

---

## 30. MÓDULO DE PROMOCIONES Y CÓDIGOS DE DESCUENTO

### Dónde se crean las reglas de promoción
- **Modelo B:** página independiente en el dashboard (Marketing → Promociones).
- Las reglas seleccionan a qué productos aplican.
- En la ficha del producto: sección "Promociones activas" que muestra las reglas existentes.
  Solo visualización + enlace a la página de promociones. No se crean desde la ficha del producto.

### Códigos de descuento
```
CONFIGURACIÓN DE UN CÓDIGO
  Código: [texto libre o generado automáticamente]
  Tipo de descuento:
    ○ Porcentaje: X%
    ○ Importe fijo: X€
  Productos aplicables: [selector · todos o específicos]
  Límite de tiempo: [fecha de caducidad opcional]
  Límite de usos: [N usos totales opcional]
  Límite por cliente: [N usos por cliente opcional]
  Ciclo aplicable: [mensual · anual · ambos]
  ¿Solo para nuevos clientes? Sí/No
```

---

## 31. SEGURIDAD, ERRORES Y ACTUALIZACIONES

### Registro de errores (solo superadmin)
- Todos los errores quedan registrados: graves · medios · leves.
- El superadmin recibe notificación interna por cada error.
- Existe un apartado de registros en el dashboard para consultar el historial.
- Tipos de error registrados: provisioning fallido · pago fallido · servidor caído ·
  email no enviado · métrica no actualizada · error de API externa · cualquier excepción.

### Lo que ve el cliente cuando hay un error
- Mensaje elegante y transparente sin romper la interfaz.
- Sin detalles técnicos del error.
- Ejemplo: "Algo no ha ido bien. Nuestro equipo ya está al tanto y lo resolverá en breve."
- El superadmin recibe notificación inmediata del error con todos los detalles técnicos.

### Actualizaciones del sistema
- Zero downtime. Las actualizaciones nunca generan página de mantenimiento.
- Deploy continuo sin interrupciones para el cliente.

---

## 32. FLUJO DE COMPRA — DOS PROCESOS

### Proceso 1 — Compra desde la landing (sin cuenta previa)
```
1. Cliente selecciona producto en la landing
2. Clic en "Contratar"
3. Formulario:
   Nombre · apellidos · email · contraseña
   Dirección · país (obligatorios)
   NIF/CIF: opcional
4. Pago
5. Cuenta creada automáticamente
6. Login automático → dashboard con producto activo
7. Notificación: "Verifica tu email" (sin limitaciones en la cuenta)
```

### Proceso 2 — Compra desde el dashboard (con cuenta previa)
```
1. Cliente se registra manualmente (mismos datos que proceso 1)
2. Debe verificar email antes de poder hacer login
3. Verifica email → hace login
4. Ve el catálogo dentro del dashboard
5. Selecciona producto
6. Se muestran sus datos de facturación guardados (editables)
7. Pago → producto activo
```

### Perfiles de facturación múltiples
- Un cliente puede tener varios perfiles de facturación.
- Puede tener perfil personal (NIF) y perfil de empresa (CIF) simultáneamente.
- El cliente define un perfil predeterminado para todas las compras.
- Al contratar un servicio puede elegir qué perfil usar para ese servicio.
- Ese servicio siempre se facturará con ese perfil · pudiendo cambiarlo después.
- El cambio de perfil en un servicio activo aplica desde la próxima factura.
- Para rectificar facturas anteriores → el cliente contacta con Aelium.

### NIF opcional — facturas simplificadas
- Si el cliente no ha introducido NIF/CIF → se emite factura simplificada.
- El cliente puede añadir el NIF después en sus datos de facturación.
- Las facturas futuras se emitirán completas con el NIF.
- Las anteriores no se rectifican automáticamente.

---

## 33. DECISIONES PENDIENTES

```
Nombres definitivos de los planes Support Inside
  → Se crean desde el dashboard al lanzar el producto

SLA exactos de cada plan Support Inside
  → Se definen con los primeros 2-3 clientes reales

Proveedor de WhatsApp Business API
  → Twilio · 360dialog · u otro · se decide al implementar el plugin

Modelo de soporte Agency con Support Inside
  → Pendiente de validar con agencias reales

Plugin enhance_cp — especificación completa
  → Documento propio al llegar al Sprint correspondiente
  → Campos de configuración del provisioner · vinculación de planes

Plugin resellerclub — especificación completa
  → Documento propio al llegar al Sprint correspondiente

Plugin docker_engine — especificación completa
  → Documento propio al llegar al Sprint correspondiente
  → Especificaciones técnicas de los servidores dedicados

Plugin ai_provider — especificación completa
  → Documento propio al desarrollarlo
  → Niveles 2 y 3 del copilot (navegar dashboard · ejecutar acciones)

Horario de atención del chat
  → Definir si se configura por días · por franjas horarias · o ambos

Cupones y descuentos — flujo de aplicación en checkout
  → Razonar antes del Sprint 2

Métricas de uso como trigger para promociones
  → Cómo se obtiene el dato por tipo de producto
  → Se cierra al implementar cada plugin

Sistema de backups
  → Externo al dashboard · proveedor y tecnología por definir
  → El dashboard solo muestra la información · no la gestiona

Nombre definitivo de "We Do It For You"
  → Pendiente de definir antes del lanzamiento (ver documento de marca)
```

---

*Documento generado a partir de las sesiones de arquitectura de Aelium · Abril 2026*
*Actualizar este documento ante cualquier nueva decisión antes de continuar el desarrollo*

---

## 34. ÚLTIMAS DECISIONES ANTES DEL SCHEMA

### Perfiles de facturación
Un cliente puede tener tres tipos de perfil simultáneamente:
```
PERFIL PERSONAL
  Nombre · apellidos · dirección · país
  NIF: opcional → genera factura simplificada si no hay NIF

PERFIL AUTÓNOMO
  Nombre · apellidos · dirección · país
  NIF: obligatorio → genera factura completa

PERFIL EMPRESA
  Razón social · dirección fiscal · país
  CIF: obligatorio → genera factura completa
```

### Sesiones activas
- Se guardan solo las sesiones activas (abiertas en este momento).
- Al cerrar sesión o al expirar → el registro se elimina.
- No hay historial de sesiones pasadas.
- El cliente puede cerrar todas sus sesiones activas desde su cuenta ("Cerrar sesión en todos los dispositivos").
- El superadmin puede cerrar sesiones activas de cualquier usuario (cliente o agente).

### Notificaciones internas — retención
- Las notificaciones leídas se conservan 90 días. Configurable en settings.
- Después de 90 días → borrado automático.
- En el historial se muestran máximo las últimas 50 notificaciones.
- Botón "Ver más" para cargar más sin mostrar todo de golpe.

---

## 35. MÓDULO PARTNER (FASE 2)

### Concepto
El partner es una agencia que revende productos de Aelium a sus clientes finales.
No es un cliente normal ni un agente. Es una capa intermedia con su propio dashboard,
su propio sistema de comisiones, y sus propios clientes.

### Modelo de negocio
```
FLUJO DE DINERO
  Cliente final del partner paga a Aelium
  Aelium retiene su parte
  Aelium liquida la comisión al partner a fin de mes automáticamente

MARGEN
  Se define por producto al crearlo (campo en products)
  El partner no puede cambiar los precios al cliente final (por ahora · abierto al futuro)

FACTURA AL CLIENTE FINAL DEL PARTNER
  Emitida por Aelium
  Formato: "Aelium · Partner: Nombre de la agencia"
  El cliente sabe que el servicio es de Aelium
```

### Auth y roles
- Mismo sistema de autenticación que todos los usuarios. Misma URL de login.
- El rol determina la experiencia completa del dashboard.
- Roles nuevos:
  - `partner_pending` → registrado y email verificado · pendiente de aprobación manual
  - `partner` → aprobado · acceso completo al dashboard partner

### Onboarding semi-automático
```
1. Partner se registra con datos adicionales:
   nombre de la agencia · CIF · web · volumen estimado de clientes

2. Verifica email → entra al dashboard con rol partner_pending
   Dashboard bloqueado · solo puede completar su perfil

3. Admin recibe notificación: "Nueva solicitud de partner"
   Puede revisar datos · contactar · pedir documentación

4. Admin aprueba manualmente
   → Rol cambia a partner
   → Se genera enlace de registro personalizado
   → Partner recibe email de activación
   → Dashboard completamente desbloqueado

5. Si se rechaza:
   → Partner recibe email con motivo
   → Estado: rejected · puede volver a solicitar
```

### Permisos del partner
```
PUEDE:
  Ver sus clientes y sus servicios (solo lectura)
  Ver facturas de sus clientes (solo lectura)
  Ver su comisión acumulada por producto y cliente
  Ver historial de soporte de sus clientes (solo lectura)
  Enviar notificaciones unidireccionales a sus clientes
  Registrar clientes via su enlace personalizado
  Ver y gestionar su propia facturación con Aelium
  Ver el historial de liquidaciones recibidas

NO PUEDE:
  Ver clientes de otros partners
  Cambiar precios de productos
  Suspender o cancelar servicios
  Crear facturas manuales
  Intervenir en conversaciones de soporte
  Tocar configuración del sistema
  Ver márgenes internos de Aelium
  Contactar con sus clientes via chat desde el dashboard
```

### Comunicación del partner con sus clientes
- Solo lectura del historial de soporte de sus clientes.
- Puede enviar notificaciones unidireccionales (avisos, comunicados).
  No son chats — no esperan respuesta. Quedan registradas en el historial del cliente.
- El equipo de Aelium también ve estas notificaciones en la ficha del cliente.

### Soporte al cliente final del partner
- Aelium da soporte directamente al cliente final del partner.
- El cliente final paga el Support Inside si lo quiere. La comisión va al partner.
- El agente ve en la ficha del cliente:
  - Nombre del partner al que pertenece.
  - Notas del partner sobre ese cliente.
  - Historial de notificaciones del partner al cliente.

### Liquidaciones al partner
- Transferencia automática a fin de mes.
- El partner elige su método de cobro:
  - IBAN · transferencia SEPA automática.
  - Stripe Connect · transferencia automática via Stripe.
- El partner ve en su dashboard su comisión acumulada en tiempo real.
- El sistema genera un resumen de liquidación antes de ejecutarla.

### Dashboard del partner — estructura
```
Inicio             → métricas: clientes · comisión del mes · próxima liquidación
Mis clientes       → lista · ficha (solo lectura) · historial de soporte · notificaciones
Mis comisiones     → por producto y cliente · historial de liquidaciones
Mi enlace          → enlace personalizado · estadísticas de registro
Mi facturación     → sus facturas con Aelium · sus servicios
Mi perfil          → datos de agencia · método de payout · facturación
```

### Campos añadidos en tablas existentes (se añaden en fase 1 como nullable)
```
users.partner_id                    → nullable FK a partners
services.partner_id                 → nullable FK a partners
invoices.partner_id                 → nullable FK a partners
invoices.partner_label              → nullable varchar "Partner: Agencia X"
products.partner_commission_pct     → decimal nullable · margen por producto
```

### Tablas nuevas (se crean en fase 2)
```
partners              → datos de la agencia · estado · enlace único · método de payout
partner_commissions   → comisión acumulada por servicio y factura del cliente final
partner_payouts       → liquidaciones realizadas · importe · fecha · método · estado
partner_notifications → notificaciones unidireccionales del partner a sus clientes
```

---

## 36. SISTEMA DE REFERIDOS (clientes normales)

### Concepto
Cada cliente normal tiene un enlace de referido único.
Si un amigo se registra con ese enlace y contrata su primer servicio,
ambos reciben un beneficio. El cliente que refiere recibe crédito mensual
mientras su referido mantenga servicios activos.

### El partner NO tiene sistema de referidos
Los partners ya tienen comisiones por cada producto de sus clientes.
No acumulan créditos de referido. Son sistemas completamente separados.

### Beneficio para el cliente que refiere
- Crédito mensual mientras el referido tenga al menos un producto activo.
- El crédito se acumula cada mes en su cuenta.
- Se aplica como descuento en su próxima factura automáticamente.
- Importe del crédito mensual: configurable en settings de referidos.
- Si el referido cancela todos sus servicios → el crédito mensual se detiene.
- El crédito acumulado no se pierde — se sigue aplicando en facturas futuras.

### Beneficio para el referido
- Descuento en su primer pedido.
- Porcentaje: configurable en settings de referidos.
- Se aplica automáticamente al detectar el enlace de referido en el registro.
- Solo aplica en la primera compra. Las siguientes no tienen descuento por este motivo.

### Cuándo se activa el beneficio
- Al registrarse con el enlace: el referido queda en estado `pending`.
  El cliente que refiere ve en su historial que X se registró pero aún no ha comprado.
- Al realizar la primera compra el referido: estado cambia a `active`.
  Se activa el crédito mensual para el cliente que refiere.
  Se aplica el descuento en el primer pedido del referido.

### Límite de referidos
- Sin límite por defecto.
- Configurable en settings: máximo de referidos activos por cliente.

### Configuración en settings (sección: Referidos)
```
Crédito mensual por referido activo: X€
Descuento primer pedido del referido: X%
Límite máximo de referidos por cliente: X (0 = sin límite)
¿Sistema de referidos activo? Sí/No (se puede desactivar globalmente)
```

### Tablas nuevas en el schema
```
referral_codes    → enlace único por cliente
referrals         → historial de referidos con su estado y créditos generados
referral_credits  → créditos acumulados por referidos activos
```

---

## 37. INFRAESTRUCTURA SELF-HOSTED

### Principio fundamental
Todo el stack corre en un solo servidor propio con Docker Compose.
Cero coste en servicios externos. Cero dependencia de terceros para operar.

### Cambio respecto al stack original
```
ANTES (con servicios externos)          AHORA (self-hosted)
─────────────────────────────           ────────────────────
Frontend: Vercel                    →   Next.js en Docker (Node)
Backend:  Railway                   →   NestJS en Docker (Node)
Workers:  Railway                   →   Workers BullMQ en Docker (Node)
Base datos: Supabase PostgreSQL     →   PostgreSQL 16 en Docker
Cache/Colas: (no definido)          →   Redis 7 en Docker
Storage: Supabase Storage           →   MinIO en Docker (S3-compatible)
Reverse proxy: (no definido)        →   Traefik en Docker (SSL automático)
Monitoring: (no definido)           →   Grafana + Prometheus + Loki en Docker
```

### Docker Compose — servicios
```yaml
services:
  traefik:        # Reverse proxy + SSL automático (Let's Encrypt)
  frontend:       # Next.js (puerto interno 3000)
  backend:        # NestJS API (puerto interno 3001)
  worker:         # BullMQ workers (mismo código, modo worker)
  postgres:       # PostgreSQL 16
  redis:          # Redis 7 (cache + BullMQ + pub/sub)
  minio:          # Storage S3-compatible (PDFs, logos, assets)
  grafana:        # Dashboards de monitoring
  prometheus:     # Métricas del sistema
  loki:           # Logs centralizados
```

### Por qué Docker Compose y no bare metal
- Aislamiento: cada servicio en su contenedor.
- Reproducibilidad: `docker compose up` y todo funciona.
- Escalabilidad futura: migrar a Docker Swarm es trivial si se necesita.
- Backups: volúmenes aislados, fáciles de respaldar.
- Updates: rebuild del contenedor sin afectar otros servicios.
- Rollback: levantar imagen anterior sin riesgo.

### Servidor recomendado
```
MÍNIMO PARA ARRANCAR
  4 vCPU · 16 GB RAM · 100 GB SSD
  Suficiente para cientos de clientes activos

PRODUCCIÓN SERIA
  8 vCPU · 32 GB RAM · 500 GB NVMe
  Miles de clientes sin problema
```

### Backup de la base de datos
- `pg_dump` automatizado con cron en el host.
- Frecuencia: diario (completo) + cada 6 horas (incremental con WAL).
- Retención: 30 días de backups completos.
- Los backups se almacenan en un directorio fuera del Docker volume.
- Test de restauración: al menos una vez al mes.

---

## 38. RESILIENCIA Y SEGURIDAD

### Outbox Pattern — eventos que nunca se pierden
Los eventos críticos entre módulos (invoice.paid → provisioning, etc.) se persisten
en la tabla `event_outbox` dentro de la misma transacción de base de datos.
Un worker de BullMQ (cola `outbox`) lee los eventos pendientes cada 5 segundos
y los despacha via EventEmitter2. Si el proceso muere, el evento sigue en la tabla.

```
Flujo:
  1. Módulo guarda dato + evento en la misma transacción (ACID)
  2. Worker outbox lee eventos con status = 'pending'
  3. Worker despacha el evento via EventEmitter2
  4. Worker marca el evento como 'done'
  5. Si falla → incrementa retry_count → reintenta en el siguiente ciclo
  6. Si agota reintentos → status = 'failed' → notificación al admin
```

### Dead Letter Queue — jobs que no desaparecen
Todos los jobs de BullMQ tienen:
- 5 reintentos con backoff exponencial (30s → 60s → 120s → 240s → 480s).
- Los que agotan reintentos quedan en estado `failed` en Redis.
- Nunca se eliminan automáticamente.
- Generan notificación al superadmin via `system.error`.
- El admin puede reintentar manualmente desde el dashboard.

### Numeración secuencial de facturas — sin race conditions
Usar PostgreSQL SEQUENCE para generar números de factura atómicos.
```sql
CREATE SEQUENCE invoice_number_seq_2026 START 1;
-- Al crear factura: SELECT nextval('invoice_number_seq_2026');
-- Una secuencia por año. Nunca duplica. Nunca salta.
```

### Encriptación de credenciales — AES-256-GCM
```
Algoritmo:      AES-256-GCM (autenticado)
Clave maestra:  variable de entorno ENCRYPTION_KEY (32 bytes hex)
Librería:       crypto nativo de Node.js (zero dependencias)
Rotación:       script manual que re-encripta con nueva clave
Cada valor:     IV único (16 bytes) + ciphertext + auth tag → Base64
```

### Rate limiting
```
API general:              100 requests/minuto por IP y por usuario
Login:                    5 intentos/minuto por IP
Registro:                 10 intentos/hora por IP
Chat (mensajes):          30 mensajes/minuto por conversación
Webhooks (Stripe):        validar firma + idempotency key
Librería:                 @nestjs/throttler con storage en Redis
```

### Circuit breaker para APIs externas
```
Librería:                 opossum (open source, Node.js)
Timeout por llamada:      10 segundos
Umbral de apertura:       50% de fallos en ventana de 10 intentos
Reset timeout:            60 segundos (intenta cerrar el circuito)
Al abrirse:               notificación al superadmin via system.error
Aplica a:                 Stripe · Enhance CP · ResellerClub · Docker API
```

### Correlation ID
- Cada request HTTP genera un UUID como `correlationId`.
- Se propaga a: logs, eventos del bus, jobs de BullMQ, error_log.
- Permite trazar todo el flujo de una operación de principio a fin.
- Middleware de NestJS lo inyecta automáticamente.

### Validación de webhooks de Stripe
El plugin de Stripe debe verificar la firma `Stripe-Signature` con el `webhook_secret`
en cada request entrante. Rechazar cualquier webhook sin firma válida.
Esto es obligatorio — sin validación, cualquiera puede simular un pago exitoso.

### Graceful shutdown
Al recibir SIGTERM:
1. El servidor deja de aceptar requests nuevos.
2. Los workers de BullMQ dejan de aceptar jobs nuevos.
3. Se esperan hasta 30 segundos a que los jobs en curso terminen.
4. Se cierran conexiones a PostgreSQL y Redis.
5. El proceso se apaga limpiamente.

### Health check
Endpoint `/health` que valida:
- Conexión a PostgreSQL activa.
- Conexión a Redis activa.
- Workers de BullMQ respondiendo.
Traefik usa este endpoint para routing y auto-restart.

### Contadores atómicos — sin race conditions
Los contadores de usos (`uses_count` en extras, promociones, descuentos)
se actualizan con SQL atómico:
```sql
UPDATE discount_codes
SET uses_count = uses_count + 1
WHERE id = $1 AND (max_uses_total IS NULL OR uses_count < max_uses_total)
RETURNING *;
-- Si no devuelve filas → el límite ya se alcanzó
```

### Token de sesión anónima — hashear
El `guest_session_token` de conversaciones se hashea con SHA-256 antes de guardar,
igual que todos los demás tokens del sistema (`sessions.token_hash`, 2FA, etc.).

---

## 39. HERRAMIENTAS Y LIBRERÍAS DEL STACK

### Decididas
```
Logging:             pino (JSON estructurado, el más rápido en Node.js)
Rate limiting:       @nestjs/throttler con storage en Redis
Circuit breaker:     opossum (open source)
Health check:        @nestjs/terminus
OpenAPI/Swagger:     @nestjs/swagger (genera docs automáticamente)
Encriptación:        crypto nativo de Node.js (AES-256-GCM)
Migraciones DB:      Prisma Migrate (migraciones SQL versionadas en git)
Storage S3:          MinIO SDK (compatible con AWS SDK)
```

### Estrategia de testing
```
Unit tests:          Jest (incluido en NestJS)
                     Lógica de negocio pura: prorrateo, promociones, descuentos
Integration tests:   Jest + testcontainers
                     Flujos críticos: invoice → payment → provisioning
Contract tests:      Para interfaces de plugins
                     Cualquier PaymentPlugin debe pasar el mismo suite
E2E:                 Solo para flujos de compra y checkout
```

### Estrategia de caching con Redis
```
Catálogo de productos:     TTL 5 minutos · invalidar al editar producto
Settings globales:         TTL 1 minuto · invalidar al editar settings
Sesiones activas:          sin TTL · se invalida al cerrar sesión
Contadores de notif:       TTL 30 segundos
Invalidación:              por clave específica, nunca flush global
```

### API versioning
Todas las rutas usan prefijo `/api/v1/`. Desde el día 1. Sin excepción.
Cuando haya breaking changes en el futuro: `/api/v2/` sin romper v1.

### Estrategia de migraciones (zero downtime)
```
Herramienta: Prisma Migrate
Patrón:      expand-contract
  1. Añadir columna nueva (nullable) → deploy
  2. Migrar datos → backfill
  3. Nuevo código usa la columna nueva → deploy
  4. Eliminar columna vieja → siguiente release
Las migraciones son siempre aditivas — nunca se elimina una columna sin deprecarla primero.
```

### Referral credits — status `expired`
Los créditos de referidos pueden expirar si no se usan en un plazo configurable.
Plazo por defecto: 12 meses. Configurable en settings (`referrals.credit_expiry_months`).
Si `credit_expiry_months = 0`, los créditos nunca expiran.

---

*Documento actualizado con decisiones de infraestructura self-hosted · Abril 2026*
*Toda la infraestructura corre en Docker Compose en servidor propio · zero coste externo*

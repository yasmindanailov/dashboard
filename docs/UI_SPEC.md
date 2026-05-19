# UI_SPEC.md — Aelium Dashboard Interface Specification

> Versión 0.2 | Abril 2026
> **Propósito:** Define cómo se organizan los elementos en cada página del dashboard.
> **Fuentes:** Documento de marca v1.6, DECISIONS.md, DESIGN_SYSTEM.md, PARTNER_ARCHITECTURE.md
> **Estado:** Sección 1 aprobada. Secciones 2-5 en desarrollo.

---

## Sección 1 — Usuarios, tareas y principios

### 1.1 Los tres usuarios del dashboard

Derivados de DECISIONS.md §5 y el documento de marca:

#### Cliente (emprendedor / pyme)

**Quién es** (del doc de marca):
> "Cualquier negocio o emprendedor español que quiere competir sacando el máximo provecho a su tecnología, sin tener que gestionarla solo."

**Su relación con la tecnología:**
- No es técnico. No quiere serlo. Quiere resultados.
- La marca dice: "Valor antes que complejidad" y "pragmático — no vende complejidad, vende resultados."
- **Consecuencia UX:** Densidad de información BAJA. Sin tecnicismos. Cada elemento debe responder: "¿tengo algo pendiente?" o "¿todo va bien?"

**Sus tareas principales (por frecuencia):**

| Frecuencia | Tarea | Qué necesita ver |
|---|---|---|
| Cada día | Comprobar que todo va bien | Estado de servicios (verde/rojo) |
| Cada semana | Pedir ayuda si algo no funciona | Acceso rápido a soporte (chat/ticket) |
| Cada mes | Pagar factura / ver historial | Facturas pendientes con CTA claro |
| Puntual | Contratar nuevo servicio | Catálogo + checkout |
| Puntual | Ver qué ha hecho Aelium por él | Historial de mantenimiento, notas |

**Lo que VE al entrar al dashboard:**
Su estado. ¿Mis servicios están bien? ¿Tengo algo pendiente? ¿Alguien me ha escrito?

**Decisión de marca que impacta UX:** "Siempre una persona real al otro lado." El dashboard del cliente NO debe sentirse como un panel de control técnico. Debe sentirse como la recepción de una oficina donde te conocen.

---

#### Agente (especialista de soporte)

**Quién es** (de DECISIONS.md §5):
> Roles: `agent_full`, `agent_billing`, `agent_support`. Técnicos especializados en dar soporte al cliente.

**Su relación con la tecnología:**
- Es técnico. Maneja terminología. Necesita acceso rápido a datos.
- La marca dice: "Memoria del cliente — nunca empieza de cero" y "cada interacción deja al cliente mejor."
- **Consecuencia UX:** Densidad de información MEDIA-ALTA. Necesita ver el contexto del cliente sin navegar. La eficiencia es prioridad.

**Sus tareas principales (por frecuencia):**

| Frecuencia | Tarea | Qué necesita ver |
|---|---|---|
| Constantemente | Responder chats en tiempo real | Lista de chats activos + contexto del cliente |
| Constantemente | Resolver tickets | Tickets sin responder, ordenados por prioridad |
| Cada día | Completar tareas de mantenimiento | Tareas de HOY con checklist |
| Cada semana | Gestionar facturas | Facturas pendientes/vencidas |
| Puntual | WOW call a cliente nuevo | Tarea específica con ficha del cliente |

**Lo que VE al entrar:**
Su trabajo pendiente. ¿Qué tickets necesitan respuesta? ¿Qué chats están esperando? ¿Qué tareas tengo hoy?

---

#### Admin (superadmin)

**Quién es** (de DECISIONS.md §5):
> Rol: `superadmin`. Visión total del negocio. Configura productos, gestiona agentes, ve métricas globales.

**Su relación con la tecnología:**
- Perfil técnico + negocio. Necesita datos para tomar decisiones estratégicas.
- **Consecuencia UX:** Densidad ALTA. Métricas, tendencias, alertas. Vista de águila del negocio.

**Sus tareas principales:**

| Frecuencia | Tarea | Qué necesita ver |
|---|---|---|
| Cada día | Visión general del negocio | Ingresos, clientes activos, alertas |
| Cada semana | Gestionar equipo | Carga de trabajo por agente |
| Puntual | Configurar catálogo | Productos, precios, drivers |
| Puntual | Resolver escalaciones | Tickets/chats críticos |

**Lo que VE al entrar:**
El pulso del negocio. ¿Cuánto facturamos? ¿Cuántos clientes? ¿Hay alguna alerta?

---

#### Partner (agencia / reseller)

**Quién es** (de DECISIONS.md §5 + PARTNER_ARCHITECTURE.md):
> Reseller o agencia de marketing que gestiona clientes referidos a través de Aelium. Ve sus clientes vinculados, comisiones, liquidaciones. Mismo dashboard, funcionalidades acotadas a su dominio.

**Su relación con la tecnología:**
- Técnico-comercial. Gestiona webs de sus clientes. Necesita visibilidad sobre lo que Aelium hace por sus referidos.
- **Consecuencia UX:** Densidad MEDIA. Necesita ver estado de sus clientes, comisiones generadas, y comunicarse con ellos. NO necesita configurar productos ni ver métricas globales de Aelium.

**Sus tareas principales:**

| Frecuencia | Tarea | Qué necesita ver |
|---|---|---|
| Cada semana | Ver estado de sus clientes referidos | Lista de clientes con servicios y estado |
| Cada mes | Revisar comisiones y liquidaciones | Comisiones del mes, liquidación pendiente |
| Puntual | Comunicar algo a un cliente | Abrir ticket o enviar notificación |
| Puntual | Añadir notas sobre un cliente | Historial de notas del cliente |
| Puntual | Gestionar desvinculaciones | Solicitudes de desvinculación |
| Puntual | Compartir enlace de referido | Enlace personalizado + estadísticas |

**Lo que VE al entrar:**
Sus números. ¿Cuánto he generado? ¿Cuántos clientes tengo activos? ¿Hay alguna liquidación pendiente?

---

### 1.2 Principios UX — Las reglas que gobiernan todas las decisiones de layout

Derivados de cruzar el documento de marca con las necesidades de cada rol:

#### P1. Densidad adaptada al rol

| Rol | Densidad | Ejemplo |
|---|---|---|
| Cliente | Baja — solo lo esencial | "Tienes 1 factura pendiente" (no: "INV-00042, €49.90, vence 15/05") |
| Agente | Media-Alta — contexto rápido | Tabla con todos los campos relevantes |
| Admin | Alta — datos para decidir | Stats + tablas + alertas |

**Regla:** Cuando la misma página la ven ambos roles, el contenido se adapta. No se crea una "versión simplificada" — se muestra lo que cada rol necesita para su siguiente acción.

#### P2. La pregunta que responde cada página

Antes de diseñar una página, se responde: **"¿Qué pregunta tiene el usuario cuando llega aquí?"**

| Página | Pregunta del cliente | Pregunta del agente/admin |
|---|---|---|
| Dashboard home | "¿Todo va bien?" | "¿Qué tengo pendiente?" |
| Clientes | (no aplica) | "¿Quién necesita atención?" |
| Billing | "¿Debo algo?" | "¿Cuánto hemos facturado? ¿Qué está pendiente?" |
| Soporte | "¿Me han respondido?" | "¿Qué tickets están sin responder?" |
| Productos | (no aplica) | "¿Qué ofrecemos? ¿Qué se vende más?" |

#### P3. Proximidad al soporte — Canales adaptativos (derivado de marca)

> Marca: "Accesibilidad real — WhatsApp, llamada o ticket. Sin formularios, sin esperas innecesarias."

El soporte es **acción global** (topbar), no sección del sidebar. Al hacer clic, se muestra un panel con los canales disponibles **según el plan del cliente** (DECISIONS.md §7 y §9):

| Plan | Canales visibles |
|---|---|
| Sin Support Inside | Chat en vivo (IA primero) · Abrir ticket |
| Básico | Chat en vivo (agente directo) · Ticket · Email · Teléfono |
| Medium | Todo anterior + WhatsApp |
| Pro | Todo anterior + WhatsApp prioritario |

El panel muestra además el plan actual del cliente y un enlace sutil a "Ver planes Support Inside" como upsell no intrusivo. Esto lo convierte en punto de contacto Y punto de conversión.

#### P4. Acción, no contemplación

> Marca: "Proactivo — no espera a que el cliente tenga un problema."

- Cada elemento visual debe llevar a una acción o confirmar un estado.
- Si una métrica no lleva a nada, no debería estar ahí.
- **Las stats justifican su presencia solo si responden a una pregunta del rol.**

#### P5. Voz Aelium en la interfaz

> 📖 **Voz canónica:** [`aelium-documento-de-marca.md §VOZ DE MARCA`](./aelium-documento-de-marca.md#voz-de-marca) + regla [D11 en `rules.md`](./00-foundations/rules.md#d11--voz-de-marca-en-mensajes-de-sistema).
> Aquí solo qué implica para anatomía de páginas. Si divergen, prevalece la doc de marca.

**Patrones aplicados a páginas del dashboard:**

- **Empty states:** tono Aelium, no genérico (`"Aún no hay facturas — todo al día"` vs `"No se encontraron resultados"`).
- **Confirmaciones (toasts):** directas (`"Factura creada"` no `"La factura ha sido creada exitosamente"`).
- **Errores:** honestos (`"No se pudo conectar. Reintentando..."` no `"Ha ocurrido un error inesperado"`).

La cercanía viene de las palabras y el ritmo, no de los emojis (eliminados en Sprint 7.5.D19 — D1).

#### P6. Páginas compartidas entre roles — contenido adaptativo

> DECISIONS.md §5: "El rol determina qué ve y qué puede hacer cada usuario."

Una misma ruta (ej: `/dashboard/billing`) renderiza contenido adaptado al rol:
- **Backend:** CASL filtra los datos (cliente ve SUS facturas, admin ve TODAS).
- **Frontend:** Muestra columnas/acciones/métricas según el rol. No duplica rutas.
- **Principio:** No es "esconder" — es mostrar lo relevante para la siguiente acción del usuario.

Esto es el patrón estándar en Stripe, Hostinger, y todo SaaS maduro. Es robusto porque la seguridad está en el backend (CASL), no en el frontend.

##### P6.1 Matriz de contenido adaptativo por página

**Regla:** Esta tabla es la fuente de verdad. Si una página no adapta su contenido al rol, es un bug de coherencia.

| Página | Elemento | Cliente | Agente | Admin | Partner |
|---|---|---|---|---|---|
| **Overview** | Stats grid | Servicios activos, Factura pendiente (€), Próx. renovación, Tickets abiertos | Chats esperando, Tickets sin responder, Tareas hoy | Clientes activos, Ingresos totales, Facturas vencidas, Tickets abiertos | Clientes referidos, Comisiones del mes, Próx. liquidación |
| **Overview** | Greeting subtitle | "Aquí tienes el estado de tus servicios." | "¿Qué tienes pendiente hoy?" | "Aquí tienes el resumen de tu plataforma." | "Resumen de tu programa de referidos." |
| **Overview** | Alertas título | "Novedades" | "Alertas" | "Alertas" | "Novedades" |
| **Overview** | Quick actions | Mis facturas, Soporte, Contratar | Chats en vivo, Tickets, Clientes | Clientes, Facturación, Productos, Soporte, Chats | Mis referidos, Comisiones |
| **Billing** | Title | "Facturación" | "Facturación" | "Facturación" | — |
| **Billing** | Subtitle | "Mis facturas y servicios" | "Gestión de facturas y cobros" | "Gestión de facturas y cobros" | — |
| **Billing** | Columna "Cliente" | ❌ Oculta (siempre son sus facturas) | ✅ Visible | ✅ Visible | — |
| **Billing** | StatusTabs | Todas, Pendientes, Pagadas, Vencidas | Todas + Canceladas + Borradores | Todas + Canceladas + Borradores | — |
| **Billing** | CTA button | "Contratar servicio" | "Crear servicio para cliente" | "Crear servicio para cliente" | — |
| **Billing** | Actions (Cobrar, Cancelar) | ❌ No visible | ✅ Visible | ✅ Visible | — |
| **Checkout** | Title / breadcrumb | "Contratar servicio" | "Crear servicio para cliente" | "Crear servicio para cliente" | — |
| **Support** | Title | "Mis tickets" | "Tickets de soporte" | "Tickets de soporte" | — |
| **Support** | CTA "Abrir ticket" | ✅ Visible | ❌ No visible (el agente responde, no abre) | ✅ Visible (abre en nombre de cliente) | — |
| **Topbar** | SupportButton | ✅ Visible | ❌ No visible | ❌ No visible | ❌ No visible |
| **Topbar** | SupportButton plan | Mostrar plan real del API (no hardcoded) | — | — | — |
| **Topbar** | Dropdown "Configuración" | Solo si tiene permiso `Setting` | Solo si tiene permiso `Setting` | ✅ Siempre | Solo si tiene permiso `Setting` |

##### P6.2 Tono por rol (derivado del documento de marca)

> Marca: "Cercano pero competente. Frases cortas. Una idea por frase."

| Rol | Tono | Ejemplo título vacío | Ejemplo alerta |
|---|---|---|---|
| **Cliente** | Cercano, tranquilizador | "Todo en orden — no tienes facturas pendientes" | "Tienes una factura pendiente" |
| **Agente** | Directo, eficiente | "Sin tickets pendientes" | "3 tickets sin primera respuesta" |
| **Admin** | Analítico, de negocio | "Sin alertas activas" | "5 facturas vencidas — requiere atención" |
| **Partner** | Comercial, motivador | "Sin novedades — tu programa de referidos está activo" | "2 nuevos clientes este mes" |

##### P6.3 Prohibiciones de texto

1. **Nunca mostrar datos hardcodeados** que deban venir del API (ej: "Tu plan: Básico" sin consultar el plan real).
2. **Nunca mostrar links a rutas inexistentes** (ej: `/dashboard/catalog` si no existe → muestra la ruta correcta o no muestra nada).
3. **Nunca mostrar columnas redundantes** (ej: columna "Cliente" cuando el usuario solo ve sus propios datos).
4. **Nunca mostrar acciones que el rol no puede ejecutar** (ej: "Abrir ticket" para un agente que responde, no abre).
5. **Nunca mostrar tabs/filtros irrelevantes** para el rol (ej: "Canceladas" para un cliente).

---

### 1.3 Mapa de navegación por rol

Lo que ve cada rol en el sidebar:

```
CLIENTE              AGENTE               ADMIN                PARTNER
─────────            ──────               ─────                ───────
  Mi panel             Panel                Panel (overview)     Mi panel
  Mis servicios        Chats                Clientes             Mis clientes
  Facturación          Tickets              Productos            Comisiones
  [Soporte: topbar]    Clientes             Facturación          Liquidaciones
                       Facturación          Soporte              Enlace referido
                       Tareas               Chats
                                            Tareas
                                            Configuración
```

**Decisión tomada:** El cliente accede a Soporte como **acción global en la topbar** (ver P3). No aparece en el sidebar.

---

### 1.4 Lo que falta definir (Secciones siguientes)

| Sección | Contenido | Estado |
|---|---|---|
| **2. Anatomía de páginas** | Templates por tipo (list, detail, form, overview). Qué bloques van, en qué orden. | ✅ Borrador |
| **3. Reglas de contenido** | Cuándo poner stats, cuándo tabs, cuándo cards vs tabla. Reglas formales. | ✅ Borrador |
| **4. Patrones de interacción** | Modales, confirmaciones, feedback, carga, errores, empty states, command palette, bulk actions, ayuda contextual. | ✅ Borrador |
| **5. Especificación por página** | Cada página del dashboard con su layout, roles, componentes, empty states y delta vs actual. | ✅ Borrador |

---

**Sección 1 — Decisiones tomadas:**

- ✅ 4 roles definidos: Cliente, Agente, Admin, Partner
- ✅ 6 principios UX derivados del documento de marca
- ✅ Soporte del cliente: acción global en topbar (canales adaptativos según plan)
- ✅ Páginas compartidas entre roles: contenido adaptativo vía CASL (P6)
- ✅ Mapa de navegación por rol definido

---

## Sección 2 — Anatomía de páginas

### 2.0 Dashboard Shell — El marco que envuelve todo

El shell es el layout fijo que envuelve todas las páginas del dashboard. Compuesto por 3 elementos: Sidebar, Topbar y ChatWidget.

```
┌──────────┬──────────────────────────────────────────┐
│          │ TOPBAR                                    │
│          │ [☰] ──────── [🔍Cmd+K] [💬] [🔔] [👤▼]  │
│ SIDEBAR  ├──────────────────────────────────────────┤
│          │                                          │
│ [Logo]   │            PAGE CONTENT                  │
│ [Nav]    │          (S2.1 - S2.7)                   │
│ [Nav]    │                                          │
│ [Nav]    │                                          │
│          │                                          │
│ [◀]      │                                          │
└──────────┴──────────────────────────────────────────┘
                                          [💬 Widget]
```

#### Sidebar

| Elemento | Especificación |
|---|---|
| Logo | Logo Aelium (símbolo + wordmark). Colapsado: solo símbolo. Link a `/dashboard`. |
| Navegación | Items filtrados por rol (CASL). Ver §1.3 para el mapa completo. |
| Items activos | Background: `var(--brand-light)`, texto: `var(--brand)`. |
| Items hover | Background: `var(--surface-secondary)`. |
| Iconos | SVG stroke 1.5, 20×20, consistentes en estilo. |
| Colapsar | Botón chevron en el footer. Solo desktop. Ancho: 260px → 72px. |
| Mobile | Drawer desde la izquierda con overlay oscuro. Se cierra al navegar. |
| Ancho desktop | Expandido: 260px. Colapsado: 72px. |

**Navegación por rol** (implementado en `Sidebar.tsx`, coherente con §1.3):

| Sección | Items | Roles |
|---|---|---|
| main | Dashboard | Todos |
| admin | Clientes, Productos, Facturación, Tickets, Chat en vivo, Tareas, Settings | Admin, Agentes |
| client | Mis servicios, Mis facturas, Soporte | Cliente |
| partner | Mis clientes, Comisiones, Mi enlace | Partner |

#### Topbar

```
IZQUIERDA                                          DERECHA
[☰ Hamburger (mobile)]                    [🔍 Cmd+K] [💬 Soporte] [🔔 Notificaciones] [Avatar ▼]
```

| Elemento | Especificación |
|---|---|
| Hamburger | Solo mobile. Abre el sidebar drawer. |
| Cmd+K trigger | Botón de búsqueda rápida. Abre Command Palette (§4.10). Sprint futuro. |
| Botón soporte | **Solo para clientes (§P3).** Abre panel de canales adaptativos según plan. |
| Campana notificaciones | Todos los roles. Badge con contador de no leídas. Abre dropdown con últimas 5. |
| Avatar + nombre | Iniciales del usuario en círculo `var(--brand)`. Nombre + rol a la izquierda (solo desktop). |
| Dropdown perfil | Al clic en avatar: "Mi perfil" · "Configuración" · "Cerrar sesión". |

**Botón soporte — Panel de canales (solo cliente):**

```
┌─────────────────────────┐
│  ¿Necesitas ayuda?      │
│                         │
│  💬 Chat en vivo        │
│  📩 Abrir ticket        │
│  📱 WhatsApp (si plan)  │
│  📞 Llámanos (si plan)  │
│  ─────────────────────  │
│  Tu plan: Básico        │
│  Ver planes Support →   │
└─────────────────────────┘
```

#### ChatWidget (clientes)

- Widget flotante en la esquina inferior derecha.
- Solo visible para rol `client`.
- Abre chat en tiempo real con agente/IA (según plan Support Inside).
- Se minimiza a un botón circular con indicador de mensajes nuevos.

#### Responsive

| Breakpoint | Sidebar | Topbar |
|---|---|---|
| Desktop (≥768px) | Fijo lateral, colapsable | Fijo top, offset por sidebar |
| Mobile (<768px) | Drawer, oculto por defecto | Full width, hamburger visible |

**Delta vs actual:** El shell existe y funciona. Falta: botón soporte en topbar (P3), Cmd+K trigger, dropdown de perfil (hoy es solo logout). El sidebar ya filtra por rol correctamente.

---

### 2.1 Los 6 tipos de página del dashboard

Toda página del dashboard es UNO de estos 6 tipos. Sin excepciones.

| Tipo | Descripción | Ejemplos |
|---|---|---|
| **Overview** | Vista general al entrar. Resumen + accesos rápidos | Dashboard home |
| **List** | Listado de entidades con filtros y paginación | Clientes, Productos, Billing, Tickets |
| **Detail** | Ficha completa de una entidad con contexto y acciones | Cliente [id], Factura [id], Ticket [id], Producto [id] |
| **Form** | Creación o edición de una entidad | Nuevo producto, Editar producto, Checkout |
| **Workspace** | Herramienta de trabajo en tiempo real | Chats (3 columnas) |

**Auth** (login, register, etc.) NO es parte del dashboard — tiene su propio layout sin sidebar ni topbar.

---

### 2.2 Clasificación de las páginas actuales

| Ruta | Tipo | Roles que la ven |
|---|---|---|
| `/dashboard` | Overview | Cliente, Agente, Admin, Partner |
| `/dashboard/clients` | List | Agente, Admin |
| `/dashboard/clients/[id]` | Detail | Agente, Admin |
| `/dashboard/products` | List | Admin |
| `/dashboard/products/[id]` | Detail | Admin |
| `/dashboard/products/new` | Form | Admin |
| `/dashboard/products/[id]/edit` | Form | Admin |
| `/dashboard/billing` | List | Cliente (sus facturas), Agente, Admin |
| `/dashboard/billing/[id]` | Detail | Cliente (la suya), Agente, Admin |
| `/dashboard/billing/checkout` | Form | Cliente, Admin |
| `/dashboard/support` | List | Cliente (sus tickets), Agente, Admin |
| `/dashboard/support/[id]` | Detail | Cliente (el suyo), Agente, Admin |
| `/dashboard/support/chats` | Workspace | Agente, Admin |
| `/dashboard/tasks` | List | Agente, Admin |
| `/dashboard/tasks/[id]` | Detail | Agente, Admin |

---

### 2.3 Anatomía: Overview

**Pregunta que responde:** "¿Todo va bien?" (cliente) / "¿Qué tengo pendiente?" (agente/admin)

```
┌─────────────────────────────────────────────────────┐
│ GREETING HEADER                                      │
│  "Buenos días, Juan"                                 │
│  Resumen en una frase del estado general             │
├─────────────────────────────────────────────────────┤
│ STATS GRID (adaptado al rol)                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ Stat 1  │ │ Stat 2  │ │ Stat 3  │ │ Stat 4  │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
├─────────────────────────────────────────────────────┤
│ CONTENT SECTIONS (máx 2-3 bloques)                   │
│  Sección A: Actividad reciente / Tareas pendientes   │
│  Sección B: Accesos rápidos / Alertas                │
└─────────────────────────────────────────────────────┘
```

**Bloques:**

| Bloque | Obligatorio | Notas |
|---|---|---|
| Greeting header | ✅ | Nombre del usuario + frase contextual. Tono Aelium (P5). |
| Stats grid | ✅ | **Único lugar donde se usan StatsCards.** Contenido varía por rol (P1, P6). |
| Content sections | ✅ | Máximo 3 secciones. Sin scroll infinito. |

**Stats por rol en Overview:**

| Rol | Stat 1 | Stat 2 | Stat 3 | Stat 4 |
|---|---|---|---|---|
| Cliente | Servicios activos | Factura pendiente (€) | Próx. renovación | Tickets abiertos |
| Agente | Chats esperando | Tickets sin responder | Tareas hoy | — |
| Admin | Clientes activos | Ingresos del mes | Facturas vencidas | Tickets abiertos |
| Partner | Clientes referidos | Comisiones del mes | Próx. liquidación | — |

---

### 2.4 Anatomía: List Page

**Pregunta que responde:** "¿Qué hay?" + "¿Necesito actuar sobre algo?"

```
┌─────────────────────────────────────────────────────┐
│ PAGE HEADER                                          │
│  h1 ─── subtitle ──────────────────── [CTA Button]  │
├─────────────────────────────────────────────────────┤
│ STATUS TABS (opcional — solo si hay estados)         │
│  Todos (142)  |  Pendientes (5)  |  Pagados (130)   │
├─────────────────────────────────────────────────────┤
│ FILTER BAR (siempre igual)                           │
│  [🔍 Search ────────────────]  [Filtro 1 ▼]  [F2 ▼] │
├─────────────────────────────────────────────────────┤
│ TABLE / CARD LIST                                    │
│  (con skeleton loading, empty state, row actions)    │
├─────────────────────────────────────────────────────┤
│ PAGINATION                          "1-20 de 142"   │
└─────────────────────────────────────────────────────┘
```

**Bloques:**

| Bloque | Obligatorio | Regla |
|---|---|---|
| Page header | ✅ | Siempre: título (h1) + subtitle a la izquierda. CTA primaria a la derecha si el rol puede crear. |
| Status tabs | Condicional | Solo si la entidad tiene estados filtables (ver §3.2). **Reemplaza las StatsCards en list pages.** |
| Filter bar | ✅ | **Siempre la misma estructura** en todas las list pages: search a la izquierda (flex-1), selects a la derecha. Sin Card envolvente. |
| Table / Card list | ✅ | Table por defecto. Card list solo si se justifica (ver §3.3). |
| Pagination | ✅ | Siempre presente. Muestra "X de Y". |

**Regla crítica: NO hay StatsCards en list pages.** Las métricas van como contadores en los Status Tabs. Si no hay estados, no hay métricas en esta página — pertenecen al Overview.

---

### 2.5 Anatomía: Detail Page

**Pregunta que responde:** "¿Qué es esto?" + "¿Qué puedo hacer con ello?"

```
┌─────────────────────────────────────────────────────┐
│ BREADCRUMB                                           │
│  Clientes > Juan García                              │
├─────────────────────────────────────────────────────┤
│ DETAIL HEADER                                        │
│  Avatar/Icono ─ Título ─ Badge estado ── [Acciones] │
│  Metadata inline (email, fecha, ID...)               │
├─────────────────────────────────────────────────────┤
│ TABS (si hay múltiples secciones)                    │
│  General  |  Servicios  |  Facturas  |  Historial   │
├─────────────────────────────────────────────────────┤
│ TAB CONTENT                                          │
│  (varía por tab — puede ser tabla, cards, timeline)  │
└─────────────────────────────────────────────────────┘
```

**Bloques:**

| Bloque | Obligatorio | Regla |
|---|---|---|
| Breadcrumb | ✅ | Siempre. Usa el componente `<Breadcrumb>` DS (mismo que FormPage). Formato: `Sección > Nombre entidad`. Ejemplo: `Clientes > Juan García`, `Facturación > INV-00042`. **No se usa chevron + Link custom.** |
| Detail header | ✅ | Identidad de la entidad: nombre/número + estado + acciones contextuales. Metadata inline (no en cards separadas). |
| Tabs | Condicional | Si la entidad tiene más de 2 secciones de contenido. Si solo hay 1, no hace falta tabs. |
| Tab content | ✅ | Puede contener tablas, timelines, formularios — según la naturaleza de la sección. |

**Regla: La información de cabecera es inline, no en cards.** Ejemplo para una factura: el número, estado, total y fecha van en el header — no en 4 StatsCards.

---

### 2.6 Anatomía: Form Page

**Pregunta que responde:** "¿Qué necesito rellenar?"

```
┌─────────────────────────────────────────────────────┐
│ BREADCRUMB                                           │
│  Productos > Nuevo producto                          │
├─────────────────────────────────────────────────────┤
│ FORM HEADER                                          │
│  h1: "Nuevo producto"                                │
├─────────────────────────────────────────────────────┤
│ FORM SECTIONS (agrupadas por Card)                   │
│  ┌─ Card: Información básica ─────────────────┐     │
│  │  [Input] [Input] [Select]                   │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─ Card: Configuración ──────────────────────┐     │
│  │  [Select] [Textarea]                        │     │
│  └─────────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────┤
│ FORM ACTIONS (sticky en bottom)                      │
│                        [Cancelar]  [Guardar]         │
└─────────────────────────────────────────────────────┘
```

**Bloques:**

| Bloque | Obligatorio | Regla |
|---|---|---|
| Breadcrumb | ✅ | Siempre. |
| Form header | ✅ | Solo título. Sin subtitle ni CTA. |
| Form sections | ✅ | Agrupadas en Cards con título de sección. Máximo 4-5 campos por sección. |
| Form actions | ✅ | Siempre al final. Cancelar (secondary) + Guardar (primary). **Sin background, sin border, sin sticky.** Los botones flotan en el espacio natural del form. Solo se añade sticky cuando el form excede 2× viewport height. El layout `FormPage` gestiona esto — la página individual NUNCA define estilos de actions. |

---

### 2.7 Anatomía: Workspace

**Pregunta que responde:** "¿Qué está pasando ahora?"

Aplica solo a la página de chats. Layout de 3 columnas que ocupa todo el viewport.

```
┌────────┬─────────────────────┬──────────────┐
│ LISTA  │ CONVERSACIÓN        │ CONTEXTO     │
│        │                     │              │
│ Chat 1 │ Mensajes            │ Ficha cliente│
│ Chat 2 │                     │ Servicios    │
│ Chat 3 │                     │ Historial    │
│ ...    │ [Input mensaje]     │ Notas        │
└────────┴─────────────────────┴──────────────┘
```

**No sigue la anatomía de list/detail.** Es una herramienta de trabajo, no una página de consulta. La columna de contexto (derecha) es lo que materializa P1 de marca: "Memoria del cliente — nunca empieza de cero."

---

### 2.8 Layout Width System — Coherencia de anchos

**Regla absoluta:** Todos los layouts del dashboard comparten el **mismo `max-width: 1200px`**. Las páginas individuales NUNCA definen su propio ancho.

| Layout component | `max-width` | Variant `.wide` | Implementado en |
|---|---|---|---|
| `ListPage` | **1200px** | 1400px | `ListPage.module.css` |
| `DetailPage` | **1200px** | 1400px | `DetailPage.module.css` |
| `FormPage` | **1200px** | — | `FormPage.module.css` |
| `Workspace` | 100% viewport | — | Layout propio sin max-width |

**¿Por qué un solo valor?**
- Al navegar entre list → detail → form, el contenido **nunca salta de ancho**. Coherencia visual absoluta.
- Un formulario no necesita ser "más estrecho" — sus inputs se agrupan en grids de 2-4 columnas **dentro** de los 1200px.
- Es lo que hacen Stripe, Vercel, Linear: un contenedor, el contenido se adapta.

**Prohibiciones:**
- ❌ Definir `.container { max-width: ... }` en CSS modules de páginas
- ❌ Pasar `style={{ maxWidth: ... }}` inline
- ❌ Usar clases Tailwind de ancho (`max-w-3xl`, `max-w-4xl`) en páginas

**Cómo usarlo:**
```tsx
// ✅ Correcto: el ancho viene del layout (1200px, siempre)
<FormPage breadcrumb={[...]} title="...">
  <Card>contenido</Card>
</FormPage>

// ❌ Incorrecto: la página define su propio ancho
<div className="max-w-3xl mx-auto">
  <Card>contenido</Card>
</div>
```

---

## Sección 3 — Reglas de contenido

### 3.1 ¿Cuándo se muestran métricas (stats)?

| Contexto | Formato | Justificación |
|---|---|---|
| **Overview (dashboard home)** | StatsCards (grid de 3-4 cards) | P4: cada stat responde a la pregunta "¿Todo va bien?" |
| **List page** | Status Tabs con contadores | P4: las métricas filtran Y informan al mismo tiempo |
| **Detail page** | Metadata inline en el header | P4: los datos de la entidad no necesitan cards separadas |
| **Form page** | Nunca | El usuario está creando/editando, no consultando |

**Regla:** Si una métrica no lleva a una acción o no responde a una pregunta del rol, no se muestra.

---

### 3.2 ¿Cuándo se usan Status Tabs?

Los Status Tabs se usan **solo si**:
1. La entidad tiene un campo `status` con estados finitos
2. Los estados representan un **flujo de trabajo** (progresión), no un estado binario
3. El número de entidades por estado aporta información accionable al rol

**Criterio clave:** ¿El estado progresa? (draft→pending→paid→overdue = progresión = StatusTabs). ¿Es binario? (active/inactive = toggle = Select).

| Página | ¿Status Tabs? | Mecanismo de filtrado | Justificación |
|---|---|---|---|
| Clientes | ❌ | Select en FilterBar | Estado binario (activo/inactivo). No hay flujo de trabajo. |
| Productos | ❌ | Select en FilterBar | Estado binario (activo/inactivo/obsoleto). No hay progresión. |
| Billing | ✅ | StatusTabs | Flujo real: draft→pending→paid/overdue/cancelled. Counts accionables. |
| Tickets | ✅ | StatusTabs | Flujo real: open→waiting→resolved→closed. Counts críticos para agentes. |

**Lo que REEMPLAZAN:** Las StatsCards que estaban en billing y tickets. Los contadores van DENTRO de los tabs, no como cards flotantes arriba.

---

### 3.3 ¿Table o Card list?

| Criterio | Table | Card list |
|---|---|---|
| Entidades con datos tabulares (columnas uniformes) | ✅ | |
| Muchas entidades (>10 típicamente) | ✅ | |
| Entidades con contenido rico (preview, texto largo) | | ✅ |
| Pocas entidades (<10 típicamente) | | ✅ |
| Necesidad de comparar entidades entre sí | ✅ | |

| Página | Formato | Justificación |
|---|---|---|
| Clientes | Table | Datos tabulares, muchas entidades |
| Productos | Table | Datos tabulares, comparación de precios |
| Billing | Table | Datos tabulares, muchas facturas |
| Tickets | Card list | Preview de mensaje (contenido rico), prioridad visual con barra lateral |

**Tickets es la excepción justificada.** El preview del último mensaje aporta valor que una tabla no puede dar. Las demás list pages usan Table.

---

### 3.4 FilterBar — Estructura fija

**Toda list page tiene el mismo FilterBar:**

```
[🔍 SearchInput (flex-1)]  [Select filtro 1]  [Select filtro 2 (si aplica)]
```

| Regla | Detalle |
|---|---|
| Search siempre a la izquierda | Ocupa el espacio restante (flex-1) |
| Selects a la derecha | Máximo 2 filtros por select |
| Sin Card envolvente | El FilterBar va directo, sin borde/fondo adicional |
| Placeholder contextual | "Buscar clientes...", "Buscar facturas...", no genérico |
| Spacing | `gap: var(--space-3)`, `margin-bottom: var(--space-4)` |

---

### 3.5 PageHeader — Estructura fija

**Toda list page y detail page tiene el mismo PageHeader:**

```
IZQUIERDA                              DERECHA
  h1: Título de la página              [CTA primaria] (si el rol puede crear)
  p: Subtitle contextual
```

| Regla | Detalle |
|---|---|
| Título | `font-size: var(--font-size-xl)`, `font-weight: var(--font-weight-semibold)` |
| Subtitle | `font-size: var(--font-size-sm)`, `color: var(--text-secondary)`. Puede incluir contadores ("142 clientes"). |
| CTA | Solo si el rol tiene permiso de creación. Siempre Button primary. |
| Spacing | `margin-bottom: var(--space-6)` |

---

### 3.6 Extensibilidad — Nuevos tipos de página

Los 6 tipos definidos cubren todas las páginas del roadmap actual y futuro. Si una página genuinamente no encaja en ningún tipo, se define un nuevo tipo en este documento **antes de construirla**. Nunca se improvisa un layout sin especificarlo primero.

Verificación contra el roadmap:

| Página futura | Tipo |
|---|---|
| Tareas del agente (Sprint 8) | List |
| Detalle de tarea | Detail |
| Configuración del sistema | Settings |
| Panel del partner | Overview |
| Clientes del partner | List |
| Comisiones del partner | List |
| Notificaciones | List |
| AI Workers (Sprint 25) | List + Detail |

---

### 3.7 Componente: StatusTabs

✅ **Implementado** (Sprint 7.5, D16a). Ubicación: `components/ui/StatusTabs/`. Usado en billing (§5.7) y support (§5.10). Los conteos se alimentan desde `groupBy` en el backend (D20).

**Especificación mínima:**

```tsx
<StatusTabs
  tabs={[
    { label: 'Todas', value: '', count: 142 },
    { label: 'Pendientes', value: 'pending', count: 5 },
    { label: 'Pagadas', value: 'paid', count: 130 },
    { label: 'Vencidas', value: 'overdue', count: 7, variant: 'danger' },
  ]}
  active={statusFilter}
  onChange={setStatusFilter}
/>
```

---

### 3.8 Variante: Detail — Conversación

El ticket detail (`/dashboard/support/[id]`) NO sigue la anatomía estándar de Detail Page. Es una **variante de conversación**: 2 columnas con el hilo de mensajes a la izquierda y el contexto del cliente a la derecha.

```
┌──────────────────────────┬──────────────────┐
│ BREADCRUMB + HEADER      │ CONTEXTO CLIENTE │
├──────────────────────────┤                  │
│ MENSAJES (timeline)      │ Ficha resumen    │
│                          │ Servicios        │
│ Msg 1 ─ agente           │ Plan soporte     │
│ Msg 2 ─ cliente          │ Historial        │
│ Msg 3 ─ agente           │ Notas internas   │
│                          │                  │
│ [Textarea respuesta]     │                  │
│ [Enviar] [Cerrar ticket] │                  │
└──────────────────────────┴──────────────────┘
```

**Diferencias con Detail estándar:**
- No usa tabs — el contenido es un timeline de mensajes.
- La sidebar de contexto está siempre visible (misma lógica que el Workspace de chats, pero sin la columna de lista).
- El header incluye: asunto, estado (Badge), prioridad, agente asignado.

---

### 3.9 SupportPanel — Chat integrado en el shell

**Decisión:** Eliminar el ChatWidget bubble flotante. El chat de soporte se integra como un **sidebar panel** que se desliza desde la derecha, activado desde el botón "Soporte" del Topbar (solo clientes, §P3).

**Justificación:**
- Los dashboards premium (Linear, Notion, Shopify) no usan bubbles flotantes. Las bubbles son para widgets de terceros (Intercom, Crisp) integrados en sitios que no controlas.
- Aelium controla su dashboard: el soporte debe sentirse nativo, no como un addon.
- El Topbar ya tiene un trigger "Soporte" (D11) — tener además un bubble es redundante.
- Marca Aelium: "a tu lado" = accesible desde el shell, siempre a un clic, sin obstruir.

**Anatomía:**

```
┌──────────────────────────────────────┬────────────────────┐
│ PÁGINA ACTUAL (dimmed overlay)       │  SUPPORT PANEL     │
│                                      │  width: 380px      │
│                                      │  ┌──────────────┐  │
│                                      │  │ Header       │  │
│                                      │  │ "Soporte"    │  │
│                                      │  │       [✕]    │  │
│                                      │  ├──────────────┤  │
│                                      │  │ Vista:       │  │
│                                      │  │  - Lista     │  │
│                                      │  │  - Chat      │  │
│                                      │  │  - Guest     │  │
│                                      │  ├──────────────┤  │
│                                      │  │ [Input]      │  │
│                                      │  │ [Enviar]     │  │
│                                      │  └──────────────┘  │
└──────────────────────────────────────┴────────────────────┘
```

**Reglas:**

| Regla | Detalle |
|---|---|
| Trigger | Botón "Chat en vivo" del panel de canales del Topbar (§P3). |
| Ancho | `380px` fijo en desktop. `100vw` en mobile (fullscreen slide-in). |
| Posición | `position: fixed`, `right: 0`, `top: 0`, `height: 100vh`, `z-index: 50`. |
| Overlay | Fondo dimmed `rgba(0,0,0,0.3)` detrás del panel. Click en overlay cierra. |
| Animación | Slide-in from right, `200ms ease-out` (§4.7). |
| Cierre | Botón ✕ en header + click en overlay + tecla ESC. |
| Persistencia | El panel NO navega. Se superpone a la página actual sin perder contexto. |
| Roles | Solo visible para `client` y guests. Agentes/admin usan `/dashboard/support/chats`. |
| Vistas internas | `list` (conversaciones recientes), `chat` (conversación activa), `guest-form` (primer contacto). |
| Componentes DS | Button, Input (o Textarea), Badge, Skeleton, EmptyState. CSS module. |

**Mobile:**

```
┌────────────────────┐
│ SUPPORT PANEL      │
│ (fullscreen)       │
│ ┌──────────────┐   │
│ │ [←] Soporte  │   │
│ ├──────────────┤   │
│ │ Mensajes     │   │
│ │ ...          │   │
│ ├──────────────┤   │
│ │ [Input]      │   │
│ │ [Enviar]     │   │
│ └──────────────┘   │
└────────────────────┘
```

---

**Secciones 2 y 3 — Decisiones tomadas:**

- ✅ 6 tipos de página: Overview, List, Detail, Form, Workspace, Settings
- ✅ Variante Detail — Conversación para tickets
- ✅ StatsCards solo en Overview — Status Tabs en List Pages
- ✅ Table por defecto, Card list solo para Tickets (contenido rico)
- ✅ FilterBar y PageHeader con estructura fija e idéntica en todas las list pages
- ✅ StatusTabs como componente nuevo necesario en el DS
- ✅ SupportPanel sidebar reemplaza ChatWidget bubble (§3.9)

**Siguiente:** Sección 4 — Patrones de interacción

---

## Sección 4 — Patrones de interacción

### 4.1 Modal vs Navegación — Cuándo usar cada uno

| Criterio | Modal | Página nueva |
|---|---|---|
| Acción rápida (1-3 campos) | ✅ | |
| Acción que no pierde contexto | ✅ | |
| Confirmaciones destructivas | ✅ | |
| Formulario complejo (>5 campos) | | ✅ |
| Entidad nueva con múltiples secciones | | ✅ |
| Contenido que requiere su propio breadcrumb | | ✅ |

**Ejemplos concretos:**

| Acción | Tipo | Justificación |
|---|---|---|
| Nuevo ticket (asunto + mensaje + categoría) | Modal | 4 campos, no pierde contexto de la lista |
| Nuevo producto (nombre, tipo, pricing, config) | Página nueva | Formulario complejo con múltiples secciones |
| Confirmar cancelación de factura | Modal (confirmación) | Requiere decisión inmediata |
| Checkout (seleccionar plan + datos + pago) | Página nueva | Flujo multi-paso |
| Cambiar estado de un servicio | Modal (confirmación) | Acción rápida con consecuencias |
| Editar notas internas de un cliente | Modal | 1-2 campos, no pierde contexto |

**Regla:** En caso de duda, usar página nueva. Los modales son para acciones rápidas y confirmaciones, no para flujos completos.

---

### 4.2 Confirmaciones — Acciones destructivas

Toda acción destructiva o irreversible requiere confirmación explícita. Se usa el componente `Modal` con estructura fija:

```
┌──────────────────────────────────┐
│  ¿Cancelar esta factura?         │
│                                  │
│  Esta acción no se puede deshacer.│
│  La factura INV-00042 pasará a   │
│  estado "Cancelada".             │
│                                  │
│           [No, volver] [Sí, cancelar] │
└──────────────────────────────────┘
```

**Reglas:**

| Regla | Detalle |
|---|---|
| Título | Pregunta directa: "¿Cancelar esta factura?" — no "Confirmación" |
| Descripción | Explica la consecuencia en 1-2 frases. Tono Aelium (P5). |
| Botón primario | Siempre describe la acción: "Sí, cancelar" / "Sí, eliminar" — no "Aceptar" |
| Botón destructivo | Usa `Button variant="danger"` |
| Botón secundario | "No, volver" — no "Cancelar" (ambiguo si la acción es cancelar) |

**Niveles de confirmación:**

| Nivel | Cuándo | Ejemplo |
|---|---|---|
| Sin confirmación | Acción reversible sin consecuencias | Cambiar filtro, editar campo |
| Confirmación simple | Acción con consecuencias moderadas | Cerrar ticket, marcar factura como pagada |
| Confirmación reforzada | Acción irreversible con impacto alto | Cancelar servicio, eliminar cliente, refund |

La confirmación reforzada puede incluir escribir el nombre de la entidad para confirmar (patrón GitHub).

---

### 4.3 Feedback — Toast vs AlertBanner

Estos dos componentes son **complementarios, no intercambiables:**

| Componente | Naturaleza | Duración | Posición | Uso |
|---|---|---|---|---|
| **Toast** | Feedback de acción | Efímero (5s) | Esquina superior derecha | "Factura creada" / "Error al guardar" |
| **AlertBanner** | Estado contextual | Persistente | Inline en la página | "Mostrando facturas de un cliente" / "Servicio suspendido" |

**Cuándo usar cada uno:**

| Situación | Componente | Ejemplo |
|---|---|---|
| El usuario hizo una acción y tuvo éxito | Toast success | "Ticket creado" |
| El usuario hizo una acción y falló | Toast error | "No se pudo enviar. Inténtalo de nuevo." |
| Hay un estado contextual que afecta la vista | AlertBanner info | "Mostrando resultados filtrados" |
| Hay un problema persistente | AlertBanner warning | "Tu plan no incluye WhatsApp" |
| Hay un error crítico del sistema | AlertBanner danger | "No se pudo conectar con el servidor" |

**Tono de mensajes (P5 — Voz Aelium):**

| Tipo | Bien | Mal |
|---|---|---|
| Éxito | "Factura creada" | "La factura ha sido creada exitosamente" |
| Error | "No se pudo guardar. Inténtalo de nuevo." | "Ha ocurrido un error inesperado" |
| Advertencia | "Este servicio se suspenderá el 15 de mayo" | "Alerta: suspensión programada" |
| Info | "Estás viendo las facturas de Juan García" | "Filtro activo: userId=123" |

---

### 4.4 Estados de carga

| Situación | Patrón | Componente DS |
|---|---|---|
| Cargando lista/tabla por primera vez | Skeleton rows | `Skeleton` × N rows |
| Cargando datos dentro de una página ya visible | Skeleton en la zona afectada | `Skeleton` |
| Ejecutando acción (guardar, enviar) | Botón en estado loading | `Button loading={true}` |
| Cargando página completa (navegación) | Barra de progreso en topbar | Por definir (NProgress o similar) |

**Reglas:**

- **Nunca texto "Cargando..."** como único feedback. Siempre skeleton o spinner visual.
- **El botón que dispara la acción** muestra el loading, no un spinner global.
- **La interfaz NO se bloquea** mientras carga. El usuario puede navegar a otra sección.

---

### 4.5 Manejo de errores

| Tipo de error | Dónde se muestra | Cómo |
|---|---|---|
| Error de validación de campo | Debajo del campo afectado | Texto rojo + borde rojo en el input |
| Error de envío de formulario | Toast error + campo afectado si aplica | "No se pudo guardar. Revisa los campos marcados." |
| Error de red / servidor | Toast error | "No se pudo conectar. Inténtalo de nuevo." |
| Sesión expirada | Redirección a login | AlertBanner en login: "Tu sesión ha expirado" |
| Permiso denegado (CASL) | Toast error + no mostrar el botón | La acción no debería ser visible si no hay permiso |
| Entidad no encontrada (404) | Página de error contextual | "Este cliente no existe o fue eliminado" |

**Regla de oro:** Si un error es prevenible, el botón/acción no debería existir en primer lugar (P6 — CASL filtra acciones por rol).

---

### 4.6 Validación de formularios

| Tipo | Cuándo | Cómo |
|---|---|---|
| Validación en tiempo real | Mientras el usuario escribe | Solo para formatos claros: email, teléfono, URL |
| Validación al perder foco (blur) | Al salir del campo | Para campos que requieren verificación: slug único, NIF/CIF |
| Validación al enviar | Al hacer clic en el botón de submit | Para el formulario completo — scroll al primer error |

**Reglas:**

- No mostrar errores en campos que el usuario no ha tocado todavía.
- Al enviar con errores: scroll automático al primer campo con error.
- Mensajes de error específicos: "El email no es válido" — no "Campo requerido" genérico.
- Si un campo tiene requisitos, mostrarlos como hint ANTES del error, no después.

---

### 4.7 Transiciones y animaciones

| Elemento | Animación | Duración |
|---|---|---|
| Modal (abrir) | Fade in + scale from 95% | `var(--transition-normal)` (200ms) |
| Modal (cerrar) | Fade out | `var(--transition-fast)` (150ms) |
| Toast (aparecer) | Slide in from right | 200ms |
| Toast (desaparecer) | Fade out | 300ms |
| Hover en filas de tabla | Background color transition | `var(--transition-fast)` |
| Cambio de tab | Fade content | 150ms |
| Skeleton shimmer | Pulse continuo | 1.5s loop |

**Regla:** Las animaciones son **funcionales, no decorativas**. Ayudan al usuario a entender qué cambió en la interfaz. Si una animación no aporta claridad, no se añade.

---

### 4.8 Empty states — Guía, no silencio

Un empty state no es solo un mensaje. Es la primera impresión del usuario en esa sección y debe reflejar la marca: proactivo, guía, no te deja solo.

**Estructura obligatoria:**

```
┌───────────────────────────────┐
│         [Icono SVG]           │
│                               │
│   Título empático             │
│   Descripción contextual      │
│                               │
│       [CTA principal]         │
└───────────────────────────────┘
```

**Ejemplos por página:**

| Página | Título | Descripción | CTA |
|---|---|---|---|
| Clientes (admin) | "Sin clientes todavía" | "Cuando un cliente se registre, aparecerá aquí." | — (no aplica) |
| Billing (cliente) | "Todo al día" | "No tienes facturas pendientes." | "Ver historial" |
| Tickets (cliente) | "Sin conversaciones" | "¿Necesitas ayuda? Estamos a un clic." | "Nueva conversación" |
| Tickets (agente, con filtro) | "Sin resultados" | "No hay tickets con estos filtros." | "Limpiar filtros" |
| Productos (admin) | "Catálogo vacío" | "Crea tu primer producto para empezar." | "Crear producto" |

**Regla de tono (P5):** Nunca "No se encontraron resultados." Siempre contextual y con siguiente paso.

---

### 4.9 Undo toast — Alternativa a confirmación simple

Para acciones de **confirmación simple** (nivel 2 del §4.2), usar toast con opción de deshacer en vez de modal previo:

```
┌──────────────────────────────────────┐
│ ✓  Ticket cerrado.  [Deshacer]  ✕   │
└──────────────────────────────────────┘
```

**Flujo:**
1. El usuario ejecuta la acción directamente (sin modal previo).
2. El backend procesa la acción.
3. Se muestra un toast con opción "Deshacer" durante 8 segundos.
4. Si el usuario pulsa "Deshacer", se revierte la acción.
5. Si no hace nada, el toast desaparece y la acción queda confirmada.

**Cuándo usar undo toast vs modal de confirmación:**

| Patrón | Cuándo |
|---|---|
| Undo toast | Acción reversible, impacto moderado: cerrar ticket, archivar, marcar como leído |
| Modal de confirmación | Acción irreversible o de alto impacto: cancelar servicio, eliminar, refund |

**Regla:** El undo toast reduce fricción para acciones frecuentes del agente. El modal se reserva para acciones que realmente necesitan una pausa antes de actuar.

---

### 4.10 Command Palette (Cmd+K / Ctrl+K)

Punto de acceso universal para navegación, búsqueda y acciones rápidas. Estándar en dashboards premium (Linear, Notion, Vercel).

```
┌──────────────────────────────────────────┐
│  🔍  Buscar o ejecutar acción...         │
├──────────────────────────────────────────┤
│  NAVEGACIÓN                              │
│    → Clientes                            │
│    → Facturación                         │
│    → Tickets                             │
│                                          │
│  ACCIONES                                │
│    + Nuevo ticket                        │
│    + Crear factura                       │
│                                          │
│  RECIENTES                               │
│    Juan García · cliente                 │
│    INV-00042 · factura                   │
└──────────────────────────────────────────┘
```

**Funcionalidades:**

| Función | Ejemplo |
|---|---|
| Buscar entidad | "Juan García" → ir a ficha del cliente |
| Buscar por ID | "INV-00042" → ir a factura |
| Navegar a sección | "clientes" → ir a /dashboard/clients |
| Ejecutar acción | "nuevo ticket" → abrir modal de nuevo ticket |
| Historial reciente | Últimas 5 entidades visitadas |

**Por rol:**
- **Cliente:** Busca sus servicios, facturas. Acciones: nueva conversación, ver factura.
- **Agente:** Busca clientes, tickets. Acciones: nuevo ticket, ir a chat.
- **Admin:** Todo lo anterior + productos, configuración.

**Implementación:** Sprint futuro (no bloquea la migración actual). Se documenta como componente del DS: `CommandPalette`.

---

### 4.11 Acciones en lote (bulk actions)

Para list pages con rol admin/agente, permitir seleccionar múltiples entidades y ejecutar acciones:

```
┌─────────────────────────────────────────────────────┐
│ ☑ Seleccionados: 3               [Acción 1] [Acción 2] │
├─────────────────────────────────────────────────────┤
│ ☑ INV-00042  │ Pendiente │ Juan García  │  €49.90  │
│ ☑ INV-00043  │ Pendiente │ María López  │  €89.00  │
│ ☑ INV-00044  │ Pendiente │ Carlos Ruiz  │  €29.90  │
│ ☐ INV-00045  │ Pagada    │ Ana Torres   │  €59.90  │
└─────────────────────────────────────────────────────┘
```

**Páginas con bulk actions:**

| Página | Acciones en lote | Roles |
|---|---|---|
| Billing | Marcar como pagadas, Exportar PDF | Admin |
| Clientes | Exportar, Asignar agente | Admin |
| Tickets | Cerrar, Reasignar, Cambiar prioridad | Agente, Admin |
| Productos | Activar/Desactivar | Admin |

**Reglas:**
- Checkbox en la primera columna de la tabla.
- Checkbox en el header para seleccionar/deseleccionar todos.
- Barra de acciones aparece SOLO cuando hay selección activa.
- Las acciones destructivas en lote siempre requieren confirmación modal (§4.2 nivel reforzado).
- Contador visible: "3 seleccionados".

---

### 4.12 Ayuda contextual — Para el cliente no técnico

Derivado de la personalidad de marca: "Experto que empodera — el conocimiento técnico es una herramienta para el cliente, no un escudo."

**Patrón:** Icono ⓘ junto a conceptos que el cliente podría no entender. Al hover/clic, muestra un tooltip con explicación breve.

```
Próxima renovación ⓘ
  ┌───────────────────────────────────────┐
  │ La renovación se cobra automáticamente│
  │ en la fecha de aniversario de tu      │
  │ servicio. Sin sorpresas.              │
  └───────────────────────────────────────┘
```

**Dónde aplicar:**

| Concepto | Explicación para el cliente |
|---|---|
| Renovación | "Se cobra automáticamente en la fecha de aniversario." |
| Staging | "Un clon de tu web para probar cambios sin afectar la real." |
| SSL | "El candado verde de tu web. Lo gestionamos nosotros." |
| DNS | "La dirección que conecta tu dominio con tu web." |
| Mantenimiento | "Revisamos que todo funcione: actualizaciones, backups, seguridad." |

**Reglas:**
- Solo para el rol `client`. Agentes y admin no necesitan tooltips explicativos.
- Tono Aelium: breve, claro, sin tecnicismos. Una frase.
- Se usa el componente `Tooltip` del DS.
- No abusar: máximo 2-3 por página. Si hay demasiados, el contenido es demasiado técnico para el cliente.

---

### 4.13 Estados de detección externa (drift) — Patrón discriminado por rol

> **Origen doctrinal:** Sprint 15C.II Hardening 2026-05-10 — [ADR-083 Amendment A4 §A4.3](./10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendment-a4-2026-05-10--hardening-ux-post-smoke-real-yasmin-sprint-15cii) congela este patrón como canónico para todos los plugins SaaS futuros (15D ResellerClub, 15E Docker, 15G Plesk).

**Principio:** información técnica = solo admin. El cliente recibe un mensaje útil pero no técnico (deriva de §1.2 P5 "voz Aelium" + §1.2 P6 "contenido adaptativo por rol").

**Cuándo aplica este patrón:**

- `service.status` ∈ {`unknown`, `failed`} con `info.statusReason` no nulo
- Cron L3 reconciliation detecta drift no auto-corregible (`subscription_missing`, `plan_divergence`, etc.)
- Plugin retorna shape canónico con discrepancia respecto al sistema externo de verdad

**Patrón canónico de render por rol:**

| Rol | Render | Componentes DS | Acciones que se ocultan |
|---|---|---|---|
| **Cliente** | Mensaje genérico empático tipo "Tu servicio está temporalmente no disponible. Hemos avisado al equipo técnico." | Texto inline (no banner) | SSO, DNS, métricas detalladas (cualquier acción que requiera metadata técnica corrupta) |
| **Admin** | `<AlertBanner variant="warning">` arriba del bloque MetricsBar mostrando `statusReason` técnico crudo + CTA "Investigar en panel del proveedor" (link SSO impersonation) | AlertBanner + Link/Button SSO | Ninguna — el admin debe poder operar para diagnosticar |

**Ejemplo concreto** (plugin Enhance CP — referencia canónica):

```
[Cliente] /dashboard/services/[id]
  Service: hosting-mi-cliente.es
  Estado: ⚠ Servicio temporalmente no disponible
          Hemos avisado al equipo técnico.

[Admin] /admin/services/[id]
  ┌─────────────────────────────────────────────────────────────┐
  │ ⚠ Drift detectado · subscription_missing                     │
  │   Razón: subscription not found in Enhance (drift detected) │
  │   [Investigar en Enhance UI →]                              │
  └─────────────────────────────────────────────────────────────┘
  Service: hosting-mi-cliente.es
  Estado canónico: active (preservado por DH-INV-6)
  [resto del detail page...]
```

**Anti-patrones (violaciones doctrina):**

- ❌ Renderizar `info.statusReason` técnico al cliente (ej. "subscription not found in Enhance") — viola §1.2 P5
- ❌ Mostrar la misma vista a admin y cliente — viola §1.2 P6
- ❌ Ocultar al admin la información técnica que necesita para diagnosticar — admin necesita el `statusReason` literal para investigar
- ❌ Modificar `service.status` automáticamente cuando hay drift — ADR-082 DH-INV-6 dice que el sistema externo gana, Aelium NO auto-corrige status (solo emite eventos)

**Aplicabilidad heredable:**

- `enhance_cp` (ya implementado Sprint 15C.II Fase C) — referencia canónica
- `resellerclub` (15D) — dominios en `redemptionPeriod`, drift de NS, etc.
- `docker_engine` (15E) — container OOM, healthcheck failed
- `plesk` (15G) — subscription suspendida en Plesk sin pasar por Aelium

Cualquier plugin que retorne `info.statusReason` no nulo con `status` distinto a `active` aplica este patrón.

---

**Sección 4 — Decisiones tomadas:**

- ✅ Modal para acciones rápidas (<5 campos), página nueva para flujos complejos
- ✅ 3 niveles de confirmación: sin, simple (undo toast), reforzada (modal)
- ✅ Toast = feedback efímero, AlertBanner = estado contextual persistente
- ✅ Undo toast reemplaza modal de confirmación para acciones moderadas reversibles
- ✅ Skeleton para carga inicial, Button loading para acciones
- ✅ Errores prevenibles → no mostrar la acción (CASL). Errores de red → Toast
- ✅ Validación progresiva: tiempo real, blur, submit
- ✅ Animaciones funcionales, no decorativas
- ✅ Empty states siempre con icono + texto empático + CTA de siguiente paso
- ✅ Command Palette (Cmd+K) como acelerador de navegación/acciones (sprint futuro)
- ✅ Bulk actions en list pages para admin/agente con checkbox + barra de acciones
- ✅ Ayuda contextual (tooltips) solo para clientes, tono Aelium, máx 2-3 por página
- ✅ **Estados drift discriminados por rol** (§4.13) — cliente generic + admin AlertBanner técnico con CTA SSO. Heredable a todos los plugins SaaS

**Siguiente:** Sección 5 — Especificación por página

---

## Sección 5 — Especificación por página

> Cada página se define con: tipo (S2), bloques exactos, variaciones por rol, componentes DS,
> interacciones clave (S4), empty state, y delta respecto a la implementación actual.

---

### 5.1 Dashboard Home (`/dashboard`) — Overview

**Tipo:** Overview (§2.3)
**Pregunta:** "¿Todo va bien?" (cliente) / "¿Qué tengo pendiente?" (agente/admin)

**Bloques:**

```
┌─────────────────────────────────────────────────────┐
│ GREETING HEADER                                      │
│  "Buenos días, Juan"                                 │
│  Frase contextual según estado (P5)                  │
├─────────────────────────────────────────────────────┤
│ STATS GRID (3-4 StatsCards según rol)                │
├─────────────────────────────────────────────────────┤
│ SECTION A: Acción inmediata / Actividad reciente     │
├─────────────────────────────────────────────────────┤
│ SECTION B: Accesos rápidos (solo cliente/partner)    │
└─────────────────────────────────────────────────────┘
```

**Greeting — Frase contextual por estado (P5):**

| Condición | Frase |
|---|---|
| Todo OK | "Todo funciona correctamente." |
| Factura pendiente | "Tienes una factura pendiente de pago." |
| Ticket sin respuesta | "Tienes una respuesta esperándote." |
| Primera vez | "Bienvenido a Aelium. Estamos a tu lado." |

**Stats por rol** (definido en §2.3):

| Rol | Stats |
|---|---|
| Cliente | Servicios activos · Factura pendiente (€) · Próx. renovación · Tickets abiertos |
| Agente | Chats esperando · Tickets sin responder · Tareas hoy |
| Admin | Clientes activos · Ingresos del mes · Facturas vencidas · Tickets abiertos |
| Partner | Clientes referidos · Comisiones del mes · Próx. liquidación |

**Sección A por rol:**

| Rol | Contenido |
|---|---|
| Cliente | Últimas 3 actividades (factura pagada, mantenimiento completado, ticket respondido). Card con timeline. |
| Agente | Tabla compacta: "Pendiente de respuesta" — top 5 tickets + top 3 chats. |
| Admin | Tabla compacta: alertas (facturas vencidas, tickets críticos, servicios fallidos). |
| Partner | Tabla compacta: últimos 5 clientes referidos con estado. |

**Sección B (solo cliente y partner):**

| Rol | Contenido |
|---|---|
| Cliente | Grid de 3 cards: "Mis servicios" · "Ver facturas" · "Hablar con soporte". Links rápidos. |
| Partner | Grid de 2 cards: "Compartir enlace" · "Ver comisiones". |

**Componentes DS:** StatsCard, Card, Table (compacta, sin paginación), Badge, Skeleton.

**Estado:** ⬜ Placeholder. La página actual muestra email/rol/ID sin contenido real. Requiere implementación completa: greeting contextual, stats por rol, secciones A y B. **Fuera del Sprint 7.5** — planificado para Sprint 9 (depende de datos reales de servicios, comisiones, etc.).

---

### 5.2 Clientes (`/dashboard/clients`) — List

**Tipo:** List Page (§2.4)
**Roles:** Agente, Admin

```
PageHeader: "Clientes" · "{n} registrados" ─── [+ Nuevo cliente] (solo admin)
FilterBar: [🔍 Buscar clientes...] [Estado ▼] [Tipo ▼: Todos / Particular / Empresa]
Table: Avatar + Nombre | Email | Tipo | Estado (Badge) | Último acceso | ⋯
Pagination: "1-20 de {n}"
```

> **Nota §3.2:** Clientes usa Select para filtrar estado (binario: activo/inactivo), NO StatusTabs. StatusTabs se reservan para entidades con workflow multi-estado (facturación, soporte).

**Columnas de tabla:**

| Columna | Siempre visible | Componente |
|---|---|---|
| Avatar + Nombre completo | ✅ | Avatar + texto (link a detail) |
| Email | ✅ | texto |
| Tipo | ✅ | Badge neutral ("Particular" / "Empresa") |
| Estado | ✅ | Badge (success/warning/danger/neutral) |
| Último acceso | ✅ | fecha relativa |
| Acciones | ✅ | menú contextual ⋯ (ver, editar, suspender) |

**Bulk actions (admin):** Exportar, Asignar agente.

**Empty state:** "Sin clientes todavía" · "Cuando un cliente se registre, aparecerá aquí."

**Componentes DS:** SearchInput, Select, Table, Badge, Avatar, Pagination, Skeleton, PageHeader, FilterBar, ListPage.

**Estado (D20):** ✅ Migrado a ListPage + FilterBar. Select para estado (§3.2). Sin StatusTabs.

---

### 5.3 Cliente Detail (`/dashboard/clients/[id]`) — Detail

**Tipo:** Detail Page (§2.5)
**Roles:** Agente, Admin

```
Breadcrumb: Clientes > Juan García
Detail Header:
  Avatar grande ─ "Juan García" ─ Badge "Activo" ── [Editar] [⋯]
  Email · Teléfono · Empresa · Cliente desde {fecha}
Tabs: Resumen | Servicios | Facturación | Soporte | Notas internas
Tab Content: (varía por tab)
```

**Tabs y su contenido:**

| Tab | Contenido | Componentes |
|---|---|---|
| Resumen | Datos de contacto + perfiles de facturación + contexto del negocio | Card con InfoRows |
| Servicios | Tabla de servicios activos (producto, estado, renovación, acciones) | Table, Badge |
| Facturación | Tabla de facturas del cliente (link a /billing/[id]) | Table, Badge |
| Soporte | Historial de tickets y chats (link a /support/[id]) | Table, Badge |
| Notas internas | Timeline de notas con categoría + formulario para nueva nota | Card, Select, Textarea, Button |

**Acciones en header:** Editar (abre modal/página), Suspender (confirmación §4.2), Eliminar (confirmación reforzada §4.2).

**Componentes DS:** DetailPage (§2.5), Avatar, Badge, Card, Table, Skeleton.

**Estado (D21):** ✅ Migrado a `DetailPage` layout. Header extraído a `ClientDetailHeader` (Avatar + Badge). Tabs via DetailPage slots. Resume/Billing tabs extraídos a sub-componentes (`ClientResumeTab`, `ClientBillingTab`). 0 colores hardcoded. 265→136 líneas (Regla 15 ✅).

---

### 5.4 Productos (`/dashboard/products`) — List

**Tipo:** List Page (§2.4)
**Roles:** Admin

```
PageHeader: "Productos" · "Catálogo de servicios" ─── [+ Nuevo producto]
FilterBar: [🔍 Buscar productos...] [Estado ▼] [Tipo ▼: Todos / hosting_web / domain / ...]
Table: Nombre | Tipo | Precio | Ciclo | Estado (Badge) | Servicios activos | ⋯
Pagination: "1-20 de {n}"
```

> **Nota §3.2:** Productos usa Select para filtrar estado (binario: activo/inactivo), NO StatusTabs.

**Empty state:** "Catálogo vacío" · "Crea tu primer producto para empezar." · [Crear producto]

**Componentes DS:** SearchInput, Select, Table, Badge, Pagination, Button, PageHeader, FilterBar, ListPage.

**Estado (D20):** ✅ Migrado a ListPage + FilterBar. Select para estado (§3.2). Sin StatusTabs.

---

### 5.5 Producto Detail (`/dashboard/products/[id]`) — Detail

**Tipo:** Detail Page (§2.5)
**Roles:** Admin

```
Breadcrumb: Productos > Web Pro
Detail Header:
  Icono tipo ─ "Web Pro" ─ Badge "Activo" ── [Editar] [Duplicar]
  Tipo: hosting_web · Precio: €X/mes · Driver: enhance_cp
Tabs: Presentación | Provisioning | Reglas de negocio | Servicios activos
```

**Componentes DS:** DetailPage (§2.5), Badge, Button, Card.

**Estado (D21):** ✅ Migrado a `DetailPage` layout. Header con Badge + Button DS. Tipos extraídos a `detail-types.ts`. Sin tabs (vista única con grid 2+1 cols). 220→181 líneas (Regla 15 ✅). **Pendiente D22:** 47 `style={{}}` restantes (usan tokens, no hex) — mover a CSS module.

---

### 5.6 Nuevo / Editar Producto (`/dashboard/products/new`, `/products/[id]/edit`) — Form

**Tipo:** Form Page (§2.6)
**Roles:** Admin

```
Breadcrumb: Productos > Nuevo producto
Form Header: "Nuevo producto"
Card "Presentación": Nombre · Descripción · Precio · Ciclo · Imagen · Badge
Card "Provisioning": Driver · Parámetros · Timeout · Acción si falla
Card "Reglas de negocio": Requiere dominio · Es addon · Límite · Trial
Form Actions: [Cancelar] [Guardar producto]
```

**Componentes DS:** DetailPage (back link), Card, Input, Select, Textarea, Button, Tooltip (ayuda contextual §4.12 para conceptos como "Driver").

**Estado:** ⬜ Legacy. Funcional pero no sigue §2.6: sin breadcrumb, 62 `className=` Tailwind + 33 `style={{}}` inline + 4 colores hex hardcoded. 272 líneas (Regla 15 violada: >200). Pendiente: D24.

---

### 5.7 Facturación (`/dashboard/billing`) — List

**Tipo:** List Page (§2.4)
**Roles:** Cliente (sus facturas), Agente, Admin

```
PageHeader: "Facturación" · "Gestión de facturas" ─── [+ Crear factura] (admin)
StatusTabs: Todas ({n}) · Pendientes ({n}) · Pagadas ({n}) · Vencidas ({n})
FilterBar: [🔍 Buscar facturas...] [Período ▼]
Table: Número | Cliente (admin) | Total | Estado (Badge) | Fecha | Vencimiento | ⋯
Pagination: "1-20 de {n}"
```

**Variación por rol (P6):**

| Elemento | Cliente | Agente / Admin |
|---|---|---|
| PageHeader subtitle | "Tus facturas" | "Gestión de facturas" |
| PageHeader CTA | — | [+ Crear factura] |
| Columna "Cliente" | No visible | Visible |
| Bulk actions | — | Marcar pagadas, Exportar |
| StatusTabs | Simplificados: Pendientes · Pagadas | Completos: Todas · Pendientes · Pagadas · Vencidas |

**Ayuda contextual para cliente (§4.12):** Tooltip en "Vencimiento" → "La fecha límite de pago. Si necesitas más tiempo, escríbenos."

**Empty state cliente:** "Todo al día" · "No tienes facturas pendientes." · [Ver historial]
**Empty state admin:** "Sin facturas" · "Las facturas se generan al crear servicios."

**Componentes DS:** StatusTabs, SearchInput, Select, Table, Badge, Pagination, Button, PageHeader, FilterBar, ListPage.

**Estado (D20):** ✅ Migrado a ListPage + FilterBar + StatusTabs. Backend extendido: `billing.getStats()` usa `groupBy` para devolver conteos por estado (draft, pending, paid, overdue, cancelled, refunded). Todos los StatusTabs muestran counts reales.

---

### 5.8 Factura Detail (`/dashboard/billing/[id]`) — Detail

**Tipo:** Detail Page (§2.5)
**Roles:** Cliente (la suya), Agente, Admin

```
Breadcrumb: Facturación > INV-00042
Detail Header:
  Icono factura ─ "INV-00042" ─ Badge "Pendiente" ── [Marcar pagada] [Descargar PDF] [⋯]
  Cliente: Juan García · Total: €49.90 · Emitida: 01/05/2026 · Vence: 15/05/2026
Tabs: Detalles | Líneas | Historial de pagos
```

**Variación por rol:**

| Elemento | Cliente | Admin |
|---|---|---|
| Header acciones | [Pagar ahora] | [Marcar pagada] [Reembolsar] [Cancelar] |
| Tab "Historial de pagos" | No visible | Visible |
| Ayuda contextual | Tooltip en "Vence" → "Fecha límite de pago." | — |

**Componentes DS:** DetailPage (§2.5), Badge, Button, Card, CSS module (`invoiceDetail.module.css`).

**Estado (D21):** ✅ Migrado a `DetailPage` layout. Refactor mayor: 80+ inline styles eliminados, CSS module creado (135 líneas). Badge+Button+Card DS reemplazan todo markup manual. Emoji 📥 eliminado. 318→177 líneas (Regla 15 ✅).

---

### 5.9 Checkout (`/dashboard/billing/checkout`) — Form

**Tipo:** Form Page (§2.6)
**Roles:** Cliente, Admin

```
Breadcrumb: Facturación > Checkout
Form Header: "Completar pago"
Card "Resumen del pedido": Producto seleccionado · Ciclo · Precio
Card "Datos de facturación": Perfil de facturación (select) o crear nuevo
Card "Método de pago": Stripe Elements
Form Actions: [Volver] [Pagar €X]
```

**Componentes DS:** DetailPage (back link), Card, Select, Input, Button.

**Estado:** ⬜ Legacy extremo. Peor archivo del dashboard: 67 `style={{}}` inline + 72 colores hex hardcoded (`#635BFF`, `#111827`, `#16A34A`, etc.). 233 líneas (Regla 15 violada). `StepConfirm.tsx` asociado: 22 inline + 24 hex. Pendiente: D23.

---

### 5.10 Tickets (`/dashboard/support`) — List

**Tipo:** List Page (§2.4) con **Card list** (excepción §3.3)
**Roles:** Cliente (sus tickets), Agente, Admin

```
PageHeader: "Soporte" · "Tus conversaciones" ─── [+ Nuevo ticket] (modal §4.1)
StatusTabs: Todos ({n}) · Abiertos ({n}) · Esperando respuesta ({n}) · Resueltos ({n})
FilterBar: [🔍 Buscar tickets...] [Prioridad ▼]
Card List:
  ┌──────────────────────────────────────────────────┐
  │ 🔴 [Prioridad] Asunto del ticket          Badge  │
  │ Preview del último mensaje (1 línea)...          │
  │ Juan García · hace 2h                            │
  └──────────────────────────────────────────────────┘
Pagination: "1-20 de {n}"
```

**Variación por rol:**

| Elemento | Cliente | Agente / Admin |
|---|---|---|
| PageHeader subtitle | "Tus conversaciones" | "Gestión de tickets" |
| Columna "Cliente" | — | Visible en cada card |
| Bulk actions | — | Cerrar, Reasignar, Cambiar prioridad |
| StatusTabs "Esperando" | "Esperando respuesta" | "Esperando cliente" / "Esperando agente" |

**Empty state cliente:** "Sin conversaciones" · "¿Necesitas ayuda? Estamos a un clic." · [Nueva conversación]

**Componentes DS:** StatusTabs, SearchInput, Select, Card (interactive), Badge, Pagination, Modal, PageHeader, FilterBar, ListPage.

**Estado (D20):** ✅ Migrado a ListPage + FilterBar + StatusTabs. Backend extendido: `support-query.getStats()` usa `groupBy` para devolver conteos por estado (open, waiting_agent, waiting_client, resolved, closed). Todos los StatusTabs muestran counts reales.

---

### 5.11 Ticket Detail (`/dashboard/support/[id]`) — Detail (variante conversación §3.8)

**Tipo:** Detail — Conversación (§3.8)
**Roles:** Cliente (el suyo), Agente, Admin

```
┌──────────────────────────────┬──────────────────┐
│ Breadcrumb: Soporte > #1042  │                  │
│ Header:                      │ CONTEXTO CLIENTE │
│  "Problema con SSL" ─ Badge  │                  │
│  Prioridad · Agente asignado │ Nombre · Email   │
├──────────────────────────────┤ Plan: Web Pro    │
│                              │ Support Inside: ✓│
│ Msg 1 ─ cliente ─ 10:00     │                  │
│ Msg 2 ─ agente ─ 10:15      │ Servicios:       │
│ Msg 3 ─ sistema ─ 10:16     │  empresa.com     │
│ Msg 4 ─ cliente ─ 11:00     │                  │
│                              │ Últimas notas:   │
│ [Textarea respuesta]         │  "Cliente VIP"   │
│ [Enviar] [Cerrar] [⋯]       │                  │
└──────────────────────────────┴──────────────────┘
```

**Variación por rol:**

| Elemento | Cliente | Agente / Admin |
|---|---|---|
| Sidebar de contexto | No visible | Visible (ficha completa del cliente) |
| Acciones | [Responder] | [Responder] [Nota interna] [Cerrar] [Reasignar] [Escalar] |
| Mensajes de sistema | Visibles pero resumidos | Visibles con detalle técnico |

**Componentes DS:** Badge, Card, Textarea, Button, Skeleton.

**Estado (D21):** ⬜ Sin cambio. Esta página es tipo **Workspace** (§2.7), no Detail estándar (§2.5). Ya está descompuesta en 6 archivos (Regla 15 ✅). Pendiente: migrar sub-componentes internos a DS (D22 auditoría).

---

### 5.12 Chats en vivo (`/dashboard/support/chats`) — Workspace

**Tipo:** Workspace (§2.7)
**Roles:** Agente, Admin

```
┌────────────────┬─────────────────────────┬──────────────────┐
│ LISTA DE CHATS │ CONVERSACIÓN ACTIVA     │ CONTEXTO CLIENTE │
│                │                         │                  │
│ [🔍 Buscar]    │ Header: nombre + estado │ Nombre · Email   │
│                │                         │ Plan: Web Pro    │
│ ● Juan (3m)   │ Burbuja agente          │ Support Inside: ✓│
│ ● María (1m)  │ Burbuja cliente         │                  │
│ ○ Carlos (5m) │ ... typing              │ Servicios:       │
│                │                         │  empresa.com     │
│ ── Resueltos ──│ [Textarea]              │                  │
│ ○ Ana         │ [Enviar] [Resolver] [⋯] │ Historial:       │
│               │                         │  3 tickets prev  │
└────────────────┴─────────────────────────┴──────────────────┘
```

**Columnas:**

| Columna | Contenido | Ancho |
|---|---|---|
| Lista | Chats activos + search. Badge online/offline. Tiempo de espera. | ~280px fijo |
| Conversación | Burbujas de chat + input + acciones (resolver, cerrar, escalar a ticket) | flex-1 |
| Contexto | Ficha resumida del cliente: datos, servicios, plan, historial, notas. Sugerencia IA (§DECISIONS.md §7). | ~320px fijo |

**Interacciones clave:**
- Resolver chat → Modal de resolución (resumen + categoría)
- Escalar a ticket → Modal (transfiere contexto completo del chat al ticket)
- Nota interna → Textarea marcado visualmente como "Solo equipo"
- Typing indicator en tiempo real (WebSocket)

**Empty state (sin chats):** "Sin chats activos" · "Cuando un cliente inicie una conversación, aparecerá aquí."

**Componentes DS:** SearchInput, Card, Badge, Button, Modal, Textarea, Skeleton.

**Estado (D16):** ✅ Migrado a CSS module (`chats.module.css`, 610 líneas). Zero inline styles. Sub-componentes: ChatList, ChatConversation, ChatClientContext, ResolutionModal, GuestLinkingPanel — todos migrados a componentes DS (SearchInput, Badge, StatusDot, Skeleton, EmptyState, Avatar, Card, Button, Modal, Textarea).

---

### 5.13 Auth (Login / Register / Reset) — Fuera del dashboard

**Tipo:** Auth (layout propio, sin sidebar/topbar)

**Layout: AuthLayout (split-screen)**

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ┌──────────────────┐  ┌──────────────────────────┐ │
│  │                  │  │                          │ │
│  │  AURORA DIGITAL  │  │   {children}             │ │
│  │  (GradientMesh)  │  │   (login/register/etc)   │ │
│  │                  │  │                          │ │
│  │    ┌──────────┐  │  │   h1: Título contextual  │ │
│  │    │  [Logo]  │  │  │   p: Subtítulo P5        │ │
│  │    │  aelium  │  │  │   [AlertBanner errores]  │ │
│  │    └──────────┘  │  │   [Input: Email]         │ │
│  │                  │  │   [Input: Contraseña]    │ │
│  │    "Tu socio     │  │   [  Button DS  ]        │ │
│  │     digital,     │  │   Footer links           │ │
│  │     a tu lado"   │  │                          │ │
│  │                  │  │                          │ │
│  └──────────────────┘  └──────────────────────────┘ │
│       55%                        45%                │
└─────────────────────────────────────────────────────┘

Mobile (<1024px): Solo panel derecho, logo "aelium" arriba
```

**Arquitectura implementada:**
```
app/
  AuthLayout.tsx         ← Split-screen compartido
  auth.module.css        ← CSS module (zero hex, zero Tailwind)
  auth-components.tsx    ← Shared: EyeIcon, PasswordCheck (DRY, D27.1)
  page.tsx               ← Login (Suspense → credentials → 2FA → redirect)
  register/page.tsx      ← Register (form → verify email success)
  forgot-password/page.tsx ← Forgot (email → success)
  reset-password/page.tsx  ← Reset (Suspense + token → new password → success)
  verify-email/page.tsx    ← Verify (Suspense + auto-verify on mount)
```

**Panel izquierdo (Aurora):**
- `GradientMesh` (Canvas 2D, Aurora Digital — identidad de marca)
- Logo SVG real (`/brand/logo-blue-black.svg`) en card glassmorphism
- Slogan "Tu socio digital, a tu lado" con fadeIn

**Tono (P5):**
- Login: "Bienvenido de vuelta" / "Inicia sesión en tu panel de gestión"
- Register: "Crear cuenta" / "Regístrate para acceder a tu panel de gestión"
- Forgot: "Recuperar contraseña" / "Te enviamos un enlace para restablecer tu contraseña"
- Reset: "Nueva contraseña" / "Elige una nueva contraseña segura"
- Error sesión expirada: AlertBanner info "Tu sesión ha expirado. Inicia sesión de nuevo." (detecta `?expired=true`)

**Componentes/clases CSS module:** `auth.module.css` con: `.authRoot`, `.auroraPanel`, `.formPanel`, `.heading`, `.headingTitle`, `.headingSubtitle`, `.formStack`, `.fieldGroup`, `.fieldLabel`, `.authInput`, `.submitButton`, `.alert`, `.alertDanger`, `.alertSuccess`, `.alertInfo`, `.passwordWrapper`, `.passwordToggle`, `.passwordChecks`, `.passwordCheck`, `.footerText`, `.footerLink`, `.successContainer`, `.successIcon`, `.successTitle`, `.successText`.

**Validación (§4.6):** Password checks en tiempo real (length, upper, lower, number, match). Email al blur. Submit completo.

**Estado:** ✅ Migrado + hardened (D27 + D27.1). 5 páginas + 1 layout + 1 CSS module + 1 shared components. ~105 inline → 0. ~28 hex → 0. Zero Tailwind. GradientMesh montado 1 vez en AuthLayout. Logo SVG real. `?expired=true` detectado. Tokens `--*-border` creados. Build ✅.

---

### 5.14 Servicio Detail (`/dashboard/services/[id]` + `/admin/services/[id]`) — Detail

> **Origen doctrinal:** Sprint 15C.II Fase F.12 — layout canónico (2026-05-19) · [dossier §A.11.10.9 / §A.11.10.9.2 R1..R6 frozen](./60-roadmap/sprint-15c-ii-hardening-enhance-dossier.md#a11109-fase-f12--layout-canónico-página-de-servicio--páginas-de-plugins). Refactoriza la composición de las fases F.4 (suspend/desync) · F.5 (billing-suspend-unify) · F.6 (notas) · F.7 (SSL) · F.8 (alertas de cuota) · F.9 (reconcile per-servicio) · F.10 (App Management) · F.11 (mini-badge salud + reenviar notif + cross-link billing). **Cero cambio funcional** — el contenido y comportamiento existente se preserva; solo cambia la **forma de orquestación** (registry declarativo + layout único).

**Tipo:** Detail (§2.5)
**Pregunta:** "¿En qué estado está mi servicio y qué puedo hacer con él?" (cliente) / "¿Cómo está operativamente y qué necesita?" (admin)
**Roles:** Cliente (su propio servicio), Agente (sin acceso a `/admin/services/*` — el rol agente no contiene `Subject.Service` admin), Admin (todos los servicios + operaciones administrativas)
**Capability-driven (ADR-077):** todo lo que cuelga del `info.capabilities.*` se decide por flags del plugin — cero `if (provisioner === 'X')` en el frontend.
**Ref:** [ADR-070 dashboard puerta unificada](./10-decisions/adr-070-service-info-sso-acciones-curadas.md), [ADR-077 contrato ProvisionerPlugin v2 + Amendments A1-A9](./10-decisions/adr-077-contrato-provisioner-plugin-v2.md), [ADR-078 A1 Modelo A SC + cookies httpOnly](./10-decisions/adr-078-aelium-app-y-arquitectura-frontend.md), [ADR-082 Domain↔Hosting + DNS doctrine](./10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md), [ADR-083 Enhance specifics + Amendments A1-A9](./10-decisions/adr-083-plugin-enhance-cp-specifics.md), [§1.2 P6 contenido adaptativo](#p6-páginas-compartidas-entre-roles--contenido-adaptativo), [§4.13 drift por rol](#413-estados-de-detección-externa-drift--patrón-discriminado-por-rol).

#### Arquitectura canónica (R2 + R3 frozen)

Una sola plantilla `<ServiceDetailLayout ctx={ctx} />` (`frontend/app/_shared/services/ServiceDetailLayout.tsx`) discriminada por rol mediante el contexto `ServiceDetailContext` (que incluye `isAdmin: boolean` + `forceAdminRoute: boolean` además de `service`/`info`/`billingCrossLink` + flags derivados `isTerminal`/`isDrift`/`isSuspended`/`suspensionReasonCode`).

Las páginas `/dashboard/services/[id]` y `/admin/services/[id]` son **wrappers finos ~30 LOC** que: (1) resuelven `id` del `params`; (2) hacen `Promise.all` de `serverFetch` para `data` + `billingCrossLink` + (admin) `overview` + `pluginHealth`; (3) componen `ctx`; (4) delegan a `<ServiceDetailLayout>`.

El layout itera **`SERVICE_DETAIL_SECTIONS`** (catálogo declarativo de descriptores `{ id, label, scope, priority, shouldRender, component }` en `frontend/app/_shared/services/service-detail-sections.tsx`) — filtra por `scope` + `shouldRender(ctx)` y ordena por `priority` descendente (1000 = arriba, 1 = abajo). Cero condiciones inline en el padre.

#### Anatomía — vista cliente (`/dashboard/services/[id]`, estado activo)

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Mis servicios                                                  │
├─────────────────────────────────────────────────────────────────┤
│ ServiceHeader (Card)                                             │
│   Icono ── Nombre servicio ── Badge estado                       │
│   "Plan Pro · hosting-micliente.es"                              │
├─────────────────────────────────────────────────────────────────┤
│ Card · Detalles del servicio                                     │
│   Plan:                Hosting Pro                               │
│   Estado:              Activo                                    │
│   Contratado el:       12 de marzo de 2026                       │
├─────────────────────────────────────────────────────────────────┤
│ MetricsBar (Card)                                                │
│   Disco 4.2 / 10 GB · CPU 12% · RAM 410 / 1024 MB                │
│   Última lectura: hace 2 min · [↻ Actualizar métricas]           │
├─────────────────────────────────────────────────────────────────┤
│ SslStatusCard (Card)                                             │
│   SSL activo — expira en 60 días                                 │
│   Renovación automática activa · Emitido por Let's Encrypt       │
├─────────────────────────────────────────────────────────────────┤
│ AppShortcutsCard (Card)                                          │
│   Apps instaladas: WordPress 6.5 (admin) · Joomla 5 (panel)      │
│   [Abrir WP-admin →]   [Abrir Joomla →]                          │
├─────────────────────────────────────────────────────────────────┤
│ BillingCrossLinkCard (Card)                                      │
│   Próxima factura: 12 de junio · 19,99 €                         │
│   Última factura pagada: INV-00042 · [Ver factura →]             │
├─────────────────────────────────────────────────────────────────┤
│ Card · Panel del proveedor                                       │
│   "Accede al panel especializado para gestión avanzada…"         │
│                                            [Abrir panel →]       │
├─────────────────────────────────────────────────────────────────┤
│ ActionsBar (sin Card propio — botones inline filtrados)          │
│   [Reiniciar servicio]   [Reset cache]   …                       │
├─────────────────────────────────────────────────────────────────┤
│ Card · DNS de tu dominio                                         │
│   "Crea, edita o elimina registros DNS…"     [Gestionar DNS →]   │
├─────────────────────────────────────────────────────────────────┤
│ Card · Historial                                                 │
│   "Consulta los eventos registrados de tu servicio"  [Ver →]     │
├─────────────────────────────────────────────────────────────────┤
│ Card · ¿Necesitas un desarrollo a medida?  (placeholder Sprint 22)│
├─────────────────────────────────────────────────────────────────┤
│ Footer: Última lectura del proveedor: 19/05/2026, 22:31          │
└─────────────────────────────────────────────────────────────────┘
```

#### Anatomía — vista admin (`/admin/services/[id]`, estado activo con drift)

```
┌──────────────────────────────────────────────────┬──────────────┐
│ ← Servicios                                       │ ⬤ Healthy 2m │  ← ProviderHealthBadge top-right
├──────────────────────────────────────────────────┴──────────────┤
│ ServiceHeader (Card)                                             │
│   Icono ── Nombre ── Badge estado (admin: tooltip ISO)           │
├─────────────────────────────────────────────────────────────────┤
│ AdminDriftBanner (AlertBanner warning) ← solo si isDrift         │
│   ⚠ Drift detectado · subscription_missing                       │
│   Razón técnica: subscription not found in Enhance               │
│   [Investigar en Enhance →]  [↻ Reconciliar]  [Re-aprovisionar]  │
├─────────────────────────────────────────────────────────────────┤
│ AdminProviderStateDesyncBanner ← solo si provider_state_desync    │
├─────────────────────────────────────────────────────────────────┤
│ MetricsBar (admin: tooltip exacto + threshold quota)             │
├─────────────────────────────────────────────────────────────────┤
│ SslStatusCard (admin: tooltip fecha ISO + emisor)                │
├─────────────────────────────────────────────────────────────────┤
│ AppShortcutsCard (admin: tooltip app_id)                         │
├─────────────────────────────────────────────────────────────────┤
│ BillingCrossLinkCard (admin: link → /admin/billing/[id])         │
├─────────────────────────────────────────────────────────────────┤
│ AdminServiceDataCard ← admin-only                                │
│   Cliente · Servicio · IDs · Fechas (3 sub-grupos)               │
├─────────────────────────────────────────────────────────────────┤
│ Card · Panel del proveedor (admin: nota GDPR impersonation)      │
├─────────────────────────────────────────────────────────────────┤
│ ActionsBar (admin: incluye actions adminOnly no-blacklisted)     │
├─────────────────────────────────────────────────────────────────┤
│ AdminServiceOperationsCard ← admin-only                          │
│   [Cambiar plan…]  [Recalcular métricas]  [Cancelar servicio…]   │
├─────────────────────────────────────────────────────────────────┤
│ ResendNotificationCard ← admin-only (whitelist 3 plantillas)     │
├─────────────────────────────────────────────────────────────────┤
│ ServiceNotesCard ← admin-only                                    │
│   Historial de notas operativas + author + timestamp             │
├─────────────────────────────────────────────────────────────────┤
│ Card · Gestión DNS  (admin: sin descripción cliente-amigable)    │
├─────────────────────────────────────────────────────────────────┤
│ Card · Historial de auditoría (admin: subtitle admin + sin filtro)│
├─────────────────────────────────────────────────────────────────┤
│ Footer: Última lectura: 19/05/2026, 22:31                        │
└─────────────────────────────────────────────────────────────────┘
```

#### Variaciones de estado (deltas respecto a las anatomías arriba)

| Estado | `ctx` flag | Banner top | Secciones ocultadas | Secciones añadidas |
|---|---|---|---|---|
| **Terminal** (`cancelled` / `terminated`) | `isTerminal=true` | `<AlertBanner variant="info">` (cliente) o `variant="danger"` (admin) con razón + fecha de cancelación | MetricsBar, SSO panel, ActionsBar, AdminServiceOperationsCard, DNS link, App shortcuts | BillingCrossLinkCard se mantiene (admin puede consultar última factura) |
| **Drift** (`info.status ∈ {unknown, failed}` + `statusReason ≠ null`) | `isDrift=true` (no aplica si `isTerminal` o `isSuspended`) | Cliente: ServiceHeader con statusReason i18n empático · Admin: `<AdminDriftBanner>` técnico con CTAs SSO + Reconcile + Re-aprovisionar | Cliente: SSO panel, DNS, ActionsBar (acciones que requieren metadata externa) · Admin: ninguna | Admin: opciones extra en el banner (recoveryHint) |
| **Suspended** (`info.status='suspended'` reconciliado F.4.1) | `isSuspended=true` (no aplica si `isTerminal`) | Cliente: `<AlertBanner variant="warning">` con motivo localizado + CTA según motivo (overdue_payment → `/dashboard/billing`; resto → `/dashboard/support`) · Admin: `<AlertBanner variant="warning">` con motivo + nota interna | Cliente: SSO panel, ActionsBar, DNS, App shortcuts (no operar como si nada) · Admin: ninguna (puede reactivar desde Operations) | Admin: `<AdminProviderStateDesyncBanner>` si `provider_state_desync=true` |
| **Loading** (initial fetch) | — | Next.js streaming (sin SC explícito) | — | — |
| **Error fetch principal** (`data=null`) | — | — | TODO | `<EmptyState>` con "No se pudo cargar el servicio" + `← Volver al listado` |
| **Error fetch side** (billing/overview/pluginHealth `null`) | — | — | La sección correspondiente | Resto de la página funciona (fail-soft heredado F.7/F.11) |

#### Registry canónico — `SERVICE_DETAIL_SECTIONS` (R3 frozen materializado)

Esta es la pieza nuclear de F.12.2 — se implementa literalmente como un array `readonly SectionDescriptor[]`. Cada fila documenta el descriptor exacto: `id` estable, `scope`, `priority`, `shouldRender` resumido en pseudocódigo, componente que monta, y notas.

| `id` (estable) | `scope` | `priority` | `shouldRender(ctx)` | Componente | Notas |
|---|---|---:|---|---|---|
| `header-back-link` | `both` | 2000 | `true` | `<BackLink href={isAdmin ? '/admin/services' : '/dashboard/services'} />` | Top breadcrumb-like link. Branches por `isAdmin`. |
| `admin-provider-health-badge` | `admin` | 1950 | `ctx.pluginHealth !== null` | `<ProviderHealthBadge health={ctx.pluginHealth} />` | Tier 4 admin-only puro (`_components/`). Renderiza en cabecera junto al back-link (layout-level slot top-right). |
| `service-header` | `both` | 1900 | `true` | `<ServiceHeader info={info} productName={service.product_name} isAdmin={ctx.isAdmin} />` | Siempre presente. |
| `banner-terminal` | `both` | 1800 | `ctx.isTerminal` | `<TerminalBanner isAdmin={ctx.isAdmin} service={service} info={info} />` | Tier 2 nuevo (encapsula AlertBanner variant condicionado). |
| `banner-suspended-client` | `client` | 1750 | `ctx.isSuspended && ctx.suspensionReasonCode !== null` | `<ClientSuspendedBanner reasonCode={ctx.suspensionReasonCode} suspendedAt={service.suspended_at} />` | Cliente NUNCA ve nota interna del admin. CTA por motivo. |
| `banner-suspended-admin` | `admin` | 1750 | `ctx.isSuspended` | `<AdminSuspendedBanner suspension={parseSuspensionReason(service.suspension_reason)} suspendedAt={service.suspended_at} />` | Admin ve nota interna completa. |
| `banner-provider-state-desync` | `admin` | 1700 | `ctx.forceAdminRoute && !ctx.isTerminal && service.provider_state_desync === true && (service.status === 'active' || service.status === 'suspended')` | `<AdminProviderStateDesyncBanner serviceId={service.id} adminStatus={…} />` | F.4.1 (admin-only). |
| `banner-drift-admin` | `admin` | 1650 | `ctx.isDrift && info.statusReason !== null && ctx.forceAdminRoute` | `<AdminDriftBanner serviceId={…} statusReason={…} hasSsoPanel={…} panelLabel={…} showReprovision={…} showReconcile={…} pluginSlug={…} supportsReconcileOne={…} />` | F.3 + F.9. Tier 4 admin-only puro. |
| `client-details-card` | `client` | 800 | `true` | `<ClientServiceDetailsCard service={service} />` | Tier 2 nuevo (encapsula el `<dl>` Plan/Estado/Contratado el). Siempre visible — garantía heredada Fase B fix-up. |
| `metrics-bar` | `both` | 600 | `!ctx.isTerminal && info.capabilities.has_metrics` | `<MetricsBar metrics={info.metrics ?? {fetchedAt:info.fetchedAt}} serviceId={service.id} isAdmin={ctx.isAdmin} quotaAlertThresholdPct={service.quota_alert_threshold_pct} />` | Capability-driven. F.8 threshold prop. |
| `ssl-card` | `both` | 500 | `!ctx.isTerminal && Boolean(info.ssl)` | `<SslStatusCard ssl={info.ssl!} isAdmin={ctx.isAdmin} />` | F.7. L16 SÍ aplica (admin tooltip ISO display-only). |
| `apps-card` | `both` | 400 | `!ctx.isTerminal && !ctx.isSuspended && info.apps !== undefined && info.apps.length > 0` | `<AppShortcutsCard apps={info.apps} serviceId={service.id} isAdmin={ctx.isAdmin} />` | F.10. Cliente oculta si suspended; admin sí ve si suspended (durante investigación) — gestionado dentro del componente o con dos descriptores `apps-card-client` / `apps-card-admin`. **A congelar en iteración v2.** |
| `billing-cross-link-card` | `both` | 350 | `ctx.billingCrossLink !== null` | `<BillingCrossLinkCard data={ctx.billingCrossLink!} isAdmin={ctx.isAdmin} />` | F.11.3. Visible también si terminal. L16 SÍ aplica. |
| `admin-service-data-card` | `admin` | 300 | `true` | `<AdminServiceDataCard data={data} />` | Tier 4 admin-only puro (`_components/`). |
| `sso-panel-card` | `both` | 90 | `!ctx.isTerminal && !ctx.isSuspended && !ctx.isDrift && info.capabilities.hasSsoPanel && info.capabilities.panel_label !== null` | `<SsoPanelCard serviceId={…} panelLabel={…} isAdmin={ctx.isAdmin} />` | Tier 2 nuevo (encapsula Card + texto + `<SsoButton>`). Admin gana copy GDPR impersonation. |
| `actions-bar` | `both` | 80 | `!ctx.isTerminal && !ctx.isSuspended` | `<ActionsBar serviceId={service.id} actions={info.availableActions} isAdmin={ctx.isAdmin} />` | F.10 ya hereda `INTERNAL_HELPER_SLUGS` blacklist. |
| `admin-service-operations-card` | `admin` | 70 | `!ctx.isTerminal` | `<AdminServiceOperationsCard serviceId={…} actions={info.availableActions} currentPlanLabel={…} serviceDisplayName={…} />` | Tier 4 admin-only puro. |
| `resend-notification-card` | `admin` | 60 | `true` | `<ResendNotificationCard serviceId={service.id} serviceDisplayName={info.display.primary} />` | F.11.2. Tier 4 admin-only puro. Visible incluso si terminal. |
| `service-notes-card` | `admin` | 50 | `true` | `<ServiceNotesCard serviceId={service.id} clientUserId={service.user_id} />` | F.6. Tier 4 admin-only puro. Visible incluso si terminal. |
| `dns-link-card` | `both` | 40 | `!ctx.isTerminal && !ctx.isSuspended && (ctx.isAdmin || !ctx.isDrift) && info.capabilities.has_dns_management` | `<DnsLinkCard serviceId={service.id} isAdmin={ctx.isAdmin} />` | Tier 2 nuevo (encapsula Card + texto cliente-amigable o admin-seco según `isAdmin`). Cliente oculta si drift; admin NO. |
| `audit-link-card` | `both` | 30 | `true` | `<ServiceAuditLinkCard serviceId={service.id} isAdmin={ctx.isAdmin} />` | Tier 2 nuevo (encapsula Card + i18n subtitle). Siempre visible. |
| `client-dev-custom-placeholder` | `client` | 20 | `true` | `<ClientDevCustomPlaceholderCard />` | Tier 2 nuevo (estático, Sprint 22 prep). Solo cliente. |
| `footer-fetched-at` | `both` | 1 | `true` | `<FetchedAtFooter fetchedAt={info.fetchedAt} />` | Tier 2 nuevo (texto plano `<p>`). |

**Total: 23 descriptores** (10 `both` + 3 `client` + 10 `admin`). El padre `<ServiceDetailLayout>` post-R3 son ~30 LOC. Los componentes nuevos Tier 2 encapsulan JSX hoy inline en `page.tsx` (sin lógica nueva — refactor puro).

**Ambigüedades pendientes a resolver durante F.12.1 iteración** (NO bloquean v1):
- **`apps-card` admin si suspended**: en el admin page actual, AppShortcutsCard se renderiza si `!isTerminal && info.apps.length > 0` (admin SÍ ve si suspended para investigación); en el cliente page se renderiza si `!isTerminal && !isSuspended && info.apps.length > 0`. **2 descriptores separados (`apps-card-client` scope:`client` + `apps-card-admin` scope:`admin`)** o **1 descriptor con `shouldRender` ramificado por `scope` interno**? — recomendación dossier: 2 descriptores (más simple, más testeable).
- **`banner-drift-admin` cuando `/dashboard/services/[id]` la abre un staff (isAdmin=true pero NO `forceAdminRoute`)**: hoy el cliente page NO renderiza AdminDriftBanner aunque el viewer sea staff (UX cliente-first del page cliente). Mantener este comportamiento → el descriptor incluye `ctx.forceAdminRoute` en `shouldRender`. Confirmar en iteración.
- **`actions-bar` cuando `isAdmin=true` en /dashboard**: hoy SÍ renderiza acciones admin-only no-blacklisted. Mantener (heredado). El descriptor solo gatea por `!isTerminal && !isSuspended`.

#### Variaciones por rol (matriz §1.2 P6.1)

| Página | Elemento | Cliente | Admin |
|---|---|---|---|
| `/services/[id]` | Endpoint backend | `GET /services/:id` (filtra ownership) | `GET /admin/services/:id` (sin filtro) |
| `/services/[id]` | Subtitle ServiceHeader | "Tu hosting Plan Pro" (info.display.secondary i18n) | Mismo + tooltip estado ISO |
| `/services/[id]` | Drift | Mensaje empático en ServiceHeader; oculta SSO/DNS/Actions | `<AdminDriftBanner>` técnico crudo arriba; mantiene TODO operativo para diagnosticar |
| `/services/[id]` | Suspended | Banner con motivo localizado (NUNCA nota interna) + CTA por motivo | Banner con motivo + nota interna; mantiene operaciones (reactivar) |
| `/services/[id]` | Datos del servicio | Card simple "Plan / Estado / Contratado el" | `<AdminServiceDataCard>` con sub-grupos Cliente/Servicio/IDs/Fechas |
| `/services/[id]` | Audit subtitle | `service.audit.subtitle_client` (acotado a su scope GDPR) | `service.audit.subtitle_admin` (vista completa) |
| `/services/[id]` | Operaciones administrativas | ❌ Oculto | `<AdminServiceOperationsCard>` visible (Cambiar plan / Recalcular / Cancelar) |
| `/services/[id]` | Reenviar notificación | ❌ Oculto | `<ResendNotificationCard>` visible (whitelist 3 plantillas + cooldown 60s) |
| `/services/[id]` | Notas del servicio | ❌ Oculto | `<ServiceNotesCard>` visible (historial completo + author) |
| `/services/[id]` | Mini-badge salud plugin | ❌ Oculto | `<ProviderHealthBadge>` top-right si fetch OK (fail-soft) |
| `/services/[id]` | Placeholder Sprint 22 | ✅ Visible | ❌ Oculto |
| `/services/[id]` | DNS link copy | Cliente-amigable: "Crea, edita o elimina registros DNS… Los cambios pueden tardar minutos en propagarse." | Admin-seco: "Revisa y edita los registros DNS de la zona…" |
| `/services/[id]` | SSO panel copy | Cliente-amigable: "Accede al panel especializado para gestión avanzada (email, BD, archivos…). Sesión registrada en tu portal de transparencia." | Admin con nota GDPR: "Abrir como admin se registra automáticamente como impersonation en el log del cliente afectado" |

#### Estados empty/error/loading

- **Empty (`data === null`)**: `<EmptyState title="No se pudo cargar el servicio" description={errorMessage ?? 'El servicio no existe o no tienes acceso.'} action={<BackLink />} />` (heredado del page actual cliente; admin mismo patrón con "El servicio no existe").
- **Loading**: streaming nativo de Next.js (RSC + Suspense del wrapper). NO se introduce skeleton custom — el SC bloquea hasta resolver `serverFetch` (patrón heredado F.1..F.11).
- **Error fetch side-data**: fail-soft. Si `billingCrossLink` falla → descriptor `billing-cross-link-card` retorna false en `shouldRender` (no se renderiza). Mismo patrón heredado F.7/F.11.
- **Error fetch overview/pluginHealth (admin)**: fail-soft. El descriptor correspondiente no renderiza pero el resto de la página funciona. F.11 doctrine.

#### Responsive (heredado §2.0 Dashboard Shell)

`<DetailPage>` layout container `max-width: 1200px` (§2.8). Cada Card descriptor ocupa 100% del ancho dentro de la columna principal. Cards con sub-bloques (MetricsBar, SslStatusCard, AppShortcutsCard, BillingCrossLinkCard) gestionan su responsive interno via flexbox/grid. Sin breakpoints específicos a `/services/[id]` — herencia completa del shell.

#### Interacciones clave (§4.x)

- **Modal**: `ChangePackageModal`, `CancelServiceModal` (typing-confirm — §4.2 nivel 3 reforzado), `SuspendServiceModal` (modo `suspend`/`unsuspend` con nota obligatoria — F.6 R2 defense-in-depth backend).
- **Toast**: feedback de Server Actions (`actions.success` / `actions.error`) — §4.3. ResendNotificationCard usa toast con cuenta atrás si 429 RESEND_TOO_FREQUENT (F.11.2 Amendment II).
- **AlertBanner**: terminal / suspended / drift / provider_state_desync (§4.3 estado contextual persistente).
- **Confirmaciones**: Cancelar servicio = reforzada (typing-confirm). Cambiar plan = modal. Suspender = modal con nota. Acciones del ActionsBar inline (sin confirmación si "no destructiva", con confirmación si destructiva — heredado F.10).
- **Empty states**: data=null → `<EmptyState>` con icono + texto empático + CTA "Volver al listado" (§4.8).

#### Decisiones y deferrals — F.12 alcance

- **Cero cambio funcional**: la lista de 23 descriptores arriba refleja el comportamiento actual del page cliente+admin (no se añade ni quita funcionalidad). E2E spec Playwright (si existe) DEBE pasar sin cambios.
- **Adopción `<PageSectionGroup>` (Tier 1 DS si se confirma)**: solo aplica si encapsula consistentemente el cromo de las Cards (h2 + spacing + bordes). Decisión final al congelar — si solo aplica a F.12 sin reutilización clara fuera, baja a Tier 3 `_shared/services/_components/SectionGroup.tsx`.
- **No se introduce paginación de secciones** (tabs / accordion / "ver más"): hoy es scroll vertical único y F.12 lo preserva. Si en el futuro la página supera ~8 secciones visibles simultáneamente, considerar Tabs (§2.5 condicional >2 secciones).
- **No se adopta `<PageSectionGroup>` en otras detail pages** (Clients §5.3, Products §5.5, Invoices §5.8, Tickets §5.11, Tasks §5.16) en F.12 — trabajo futuro si se promociona a Tier 1.
- **DC.46..49 + DC.NEW-51..58 NO se abordan** (housekeeping post-15C.II).

---

### 5.15 Tareas (`/dashboard/tasks`) — List

**Tipo:** List (§2.4)
**Pregunta:** "¿Qué tengo pendiente?" (agente) / "¿Cómo va el equipo?" (admin)
**Roles:** Agente (sus tareas + sin asignar), Admin (todas)
**Ref:** DECISIONS.md §10, DATABASE_SCHEMA.md `tasks`

**Layout:**

```
┌─────────────────────────────────────────────────────┐
│ PAGEHEADER                                           │
│  Título: "Tareas"                                    │
│  Subtítulo: role-aware (ver tabla)                   │
│  CTA: "Nueva tarea" (solo admin)                    │
├─────────────────────────────────────────────────────┤
│ STATUSTABS                                           │
│  Hoy · Esta semana · Pendientes · Completadas        │
├─────────────────────────────────────────────────────┤
│ FILTERBAR                                            │
│  SearchInput + Select tipo + Select prioridad        │
│  + Select agente (solo admin)                        │
├─────────────────────────────────────────────────────┤
│ TABLE                                                │
│  Prioridad | Título | Cliente | Tipo | Agente |      │
│  Vencimiento | Estado                                │
├─────────────────────────────────────────────────────┤
│ PAGINATION                                           │
└─────────────────────────────────────────────────────┘
```

**StatusTabs (§3.2):**

| Tab | Filtro | Variante | Contador |
|-----|--------|----------|----------|
| Hoy | `due_date <= fin del día` + status != completed | `danger` si >0 | Tareas con vencimiento hoy |
| Esta semana | `due_date <= fin de semana` + status != completed | `warning` si >0 | Tareas de la semana |
| Pendientes | `status IN (pending, in_progress)` | — | Total pendientes |
| Completadas | `status = completed` | `success` | Total completadas |

**Columnas Table:**

| Columna | Contenido | Width |
|---------|-----------|-------|
| Prioridad | Barra color vertical (4px): critical=rojo, high=naranja, medium=gris, low=border) | 4px |
| Título | Título de la tarea. Link a detail | — |
| Cliente | Nombre del cliente (link a ficha). Oculto para agente si redundante | — |
| Tipo | Badge: `WOW Call`, `Mantenimiento`, `Proyecto`, `Custom` | 130px |
| Agente | Nombre del agente asignado. "Sin asignar" en text-tertiary si null | 140px |
| Vencimiento | Fecha. Rojo si pasada y no completada (§overdue) | 120px |
| Estado | Badge: Pendiente (neutral), En progreso (info), Completada (success), Vencida (danger), Cancelada (neutral) | 120px |

**Contenido adaptativo por rol (P6.1):**

| Elemento | Admin | Agente |
|----------|-------|--------|
| Subtítulo | "Gestión de tareas del equipo" | "Mis tareas pendientes" |
| CTA "Nueva tarea" | ✅ Visible | ❌ Oculto |
| Filtro "Agente" | ✅ Select con lista de agentes | ❌ Oculto (filtro implícito: solo sus tareas) |
| Columna "Agente" | ✅ Visible | ❌ Oculto (redundante) |
| Datos visibles | TODAS las tareas de TODOS los agentes | Sus tareas (assigned_to = su id) + sin asignar |
| Bulk actions | ✅ Reasignar en lote, Cancelar en lote | ❌ No disponible |

**Empty states (§4.8, tono P5):**

| Contexto | Icono | Título | Descripción |
|----------|-------|--------|-------------|
| Sin tareas (agente) | ✓ check | "¡Buen trabajo!" | "No tienes tareas pendientes. Disfruta del momento." |
| Sin tareas (admin) | clipboard | "Sin tareas activas" | "No hay tareas que coincidan con los filtros." |
| Sin resultados búsqueda | search | "Sin resultados" | "Prueba con otros filtros o términos de búsqueda." |

**Modal "Nueva tarea" (§4.1 — modal, no navegación):**

Formulario en Modal `size="md"`:
- Input: Título (obligatorio)
- Textarea: Descripción (opcional)
- Select: Tipo (wow_call, maintenance, custom_work, project_task)
- Select: Prioridad (low, medium, high, critical)
- SearchInput: Cliente destino (obligatorio)
- Select: Servicio vinculado (opcional, filtrado por cliente seleccionado)
- Select: Agente asignado (opcional)
- DatePicker: Fecha de vencimiento (opcional)
- Actions: Cancelar + "Crear tarea"

**Componentes DS:** ListPage, PageHeader, StatusTabs, FilterBar, SearchInput, Select, Table, Badge, Pagination, Modal, Input, Textarea, Button, EmptyState, Skeleton, Toast.

**Estado:** ⬜ Sprint 8.

---

### 5.16 Tarea Detail (`/dashboard/tasks/[id]`) — Detail

**Tipo:** Detail (§2.5)
**Pregunta:** "¿Qué tengo que hacer exactamente?"
**Roles:** Agente (su tarea), Admin (cualquier tarea)
**Ref:** DECISIONS.md §10, DATABASE_SCHEMA.md `tasks`, `task_checklist_completions`, `maintenance_logs`

**Layout:**

```
┌─────────────────────────────────────────────────────┐
│ BREADCRUMB                                           │
│  Tareas > Mantenimiento · empresa.com                │
├─────────────────────────────────────────────────────┤
│ HEADER                                               │
│  Título de la tarea                                  │
│  Badge tipo + Badge prioridad + Badge estado         │
│  Select estado (transición) + Select agente (admin)  │
├─────────────────────────────────────────────────────┤
│ TWO COLUMNS                                          │
│ ┌──────────────────────┬────────────────────────┐   │
│ │ MAIN COLUMN          │ SIDEBAR                │   │
│ │                      │                        │   │
│ │ Card: Descripción    │ Card: Cliente           │   │
│ │                      │  Avatar + nombre        │   │
│ │ Card: Checklist      │  Link "Ver perfil"      │   │
│ │  ☐ Actualizar core   │                        │   │
│ │  ☑ Revisar SSL       │ Card: Servicio          │   │
│ │  ☐ Backup            │  Nombre + estado        │   │
│ │                      │  Link al servicio       │   │
│ │ Card: Notas cliente  │                        │   │
│ │  Textarea            │ Card: Historial         │   │
│ │                      │  Creada: 24 abr         │   │
│ │ Card: Notas internas │  Asignada: 24 abr       │   │
│ │  Textarea            │  En progreso: 25 abr    │   │
│ │                      │                        │   │
│ │ [Completar y notif.] │                        │   │
│ └──────────────────────┴────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Header — controles de estado:**

| Control | Quién lo ve | Opciones |
|---------|------------|----------|
| Select "Estado" | Agente + Admin | pending → in_progress → completed. Cancelar solo admin |
| Select "Agente" | Solo Admin | Lista de agentes del equipo + "Sin asignar" |
| Select "Prioridad" | Solo Admin | low, medium, high, critical |

**Columna izquierda — bloques por tipo de tarea:**

| Tipo | Bloques visibles |
|------|-----------------|
| `maintenance` / `maintenance_management` | Descripción + **Checklist** (heredado del producto/servicio) + Notas cliente + Notas internas + Botón "Completar y notificar" |
| `wow_call` | Descripción + **Datos del cliente** (nombre, email, servicio contratado, plan, notas del checkout) + Campo "Resumen de la llamada" + Botón "Completar" |
| `custom_work` | Descripción + Notas cliente + Notas internas + Botón "Completar" |
| `project_task` | Descripción + Link al proyecto (Sprint 22) + Notas internas + Botón "Completar" |

**Checklist (solo maintenance):**
- Items heredados de `product_checklist_items` → copiados a `service_checklist_items` al crear el servicio → referenciados en `task_checklist_completions`.
- Cada item: checkbox + label. Toggle guarda inmediatamente (`PATCH`).
- Items `is_required = true`: no se puede completar la tarea sin marcarlos.
- Progreso: "3/7 completados" debajo del título del card.

**Flujo "Completar y notificar" (maintenance):**

```
1. Agente completa checklist (items required todos ✓)
2. Escribe "Notas para el cliente" (textarea — van al email)
3. Escribe "Notas internas" (textarea — solo equipo, guardadas en ClientNote)
4. Click "Completar y notificar"
5. → Modal confirmación (§4.2): "Se notificará al cliente por email. ¿Confirmar?"
6. → Backend:
   a. task.status = completed, task.completed_at = now()
   b. maintenance_log creado (task_id, service_id, client_notes, internal_notes)
   c. ClientNote auto-creada (category: technical, linked to task)
   d. Evento maintenance.completed emitido → email al cliente
7. → Toast success: "Tarea completada. Cliente notificado."
8. → Redirect a /dashboard/tasks
```

**Sidebar derecha:**

| Card | Contenido |
|------|-----------|
| **Cliente** | Avatar + nombre completo + email. Link "Ver perfil" (con `?from` para ContextBackLink) |
| **Servicio** | Nombre del servicio + Badge estado (active/suspended). Link al servicio (futuro). Solo si `service_id` no es null |
| **Historial** | Timeline vertical: Creada (fecha) → Asignada a [nombre] (fecha) → En progreso (fecha) → Completada (fecha). Cada entry = `metaLine` con icono + texto + timestamp |

**Contenido adaptativo por rol (P6.1):**

| Elemento | Admin | Agente |
|----------|-------|--------|
| Select "Agente" | ✅ Puede reasignar | ❌ Oculto |
| Select "Prioridad" | ✅ Puede cambiar | ❌ Solo lectura (Badge) |
| Botón "Cancelar tarea" | ✅ Visible | ❌ Oculto |
| Checklist toggle | ✅ | ✅ |
| Completar y notificar | ✅ | ✅ |

**Componentes DS:** DetailPage, Breadcrumb, Badge, Select, Card, Button, Modal, Textarea, Skeleton, Toast, Avatar.

**Estado:** ⬜ Sprint 8.

---

### 5.17 Resumen de componentes nuevos requeridos

Componentes que el DS necesitaba para implementar S5. Todos los de prioridad alta/media están implementados (Sprint 7.5):

| Componente | Prioridad | Usado en | Estado |
|---|---|---|---|
| **StatusTabs** | Alta | Billing, Tickets | ✅ D16a |
| **Breadcrumb** | Alta | Integrado en DetailPage | ✅ D16b (como back link en DetailPage) |
| **Tabs** | Alta | Cliente [id] | ✅ D16b (integrado en DetailPage) |
| **PageHeader** | Media | Todas las list pages | ✅ D16b |
| **FilterBar** | Media | Todas las list pages | ✅ D16b |
| **ListPage** | Media | Todas las list pages | ✅ D16b |
| **DetailPage** | Media | Todas las detail pages | ✅ D16b |
| **CommandPalette** | Baja — sprint futuro | Global | ⬜ |
| **UndoToast** | Baja — extensión de Toast existente | Acciones moderadas | ⬜ |

---

**Sección 5 — Decisiones tomadas:**

- ✅ 13 páginas especificadas con anatomía exacta
- ✅ Variaciones por rol documentadas para cada página compartida (P6)
- ✅ Empty states con tono Aelium para cada página (P5, §4.8)
- ✅ Estado por página actualizado post-migración (D20, D21, D22-D28)
- ✅ Todos los componentes de prioridad alta/media implementados (Sprint 7.5)
- ✅ Auth fuera del dashboard con layout propio
- ✅ Roadmap D17-D32 cubre todas las páginas y patrones pendientes: sub-componentes (D22), checkout (D23), form pages (D24), support detail (D25), overview (D26), auth (D27), ayuda contextual (D28), undo toast (D29), command palette (D30), bulk actions (D31), auditoría final §4 (D32)

---

## Resumen del UI_SPEC completo

| Sección | Estado |
|---|---|
| S1. Usuarios, tareas y principios | ✅ Cerrada |
| S2. Anatomía de páginas (6 tipos) | ✅ Cerrada |
| S3. Reglas de contenido | ✅ Cerrada |
| S4. Patrones de interacción (12 patrones) | ✅ Cerrada |
| S5. Especificación por página (15 páginas) | ✅ Cerrada |

> Este documento es la fuente de verdad para la interfaz del dashboard Aelium.
> Toda página nueva debe clasificarse en un tipo (S2), seguir sus reglas (S3-S4),
> y documentarse en S5 antes de implementarse.

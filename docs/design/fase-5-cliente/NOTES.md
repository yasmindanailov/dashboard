# NOTES.md — Fase 5 · Mockups Portal Cliente

> Deudas de migración del código actual hacia los mockups aprobados.
> Cero cambios en `frontend/` durante esta fase.

---

## Resumen

Fase 5 entrega 7 mockups del portal cliente componiendo el sistema
construido en fases 1-4. Todos los driftings detectados en
`audit-existing.md` (D5-1..D5-12) tienen aquí su plan de migración.

La mayoría son **cambios de copy** (voz Aelium aplicada). Pocos
estructurales — el sistema ya está bien pensado.

---

## Migraciones de copy (D5-1, D5-2, D5-7)

### N5-1 · "Mis" → "Tus" en titles
Caso · Pequeño (1h)

| Archivo | Línea | Antes | Después |
|---|---|---|---|
| `dashboard/services/page.tsx` | 167 | `title="Mis servicios"` | `title="Tus servicios"` |
| `dashboard/billing/page.tsx` | 152 | `title="Mis facturas"` | `title="Tus facturas"` |
| `dashboard/Sidebar.tsx` | 111 | `label: 'Mis servicios'` | `label: 'Tus servicios'` |
| `dashboard/Sidebar.tsx` | 112 | `label: 'Mis facturas'` | `label: 'Tus facturas'` |
| `dashboard/Sidebar.tsx` | 117 | `label: 'Mis clientes'` (partner) | `label: 'Tus clientes'` |
| `dashboard/Sidebar.tsx` | 119 | `label: 'Mi enlace'` (partner) | `label: 'Tu enlace'` |

Tests E2E de smoke deberían capturar el cambio.

### N5-2 · Subtitle de billing
Caso · Pequeño (30 min)

```tsx
// dashboard/billing/page.tsx línea 153
- subtitle="Tus facturas y servicios contratados"
+ subtitle={`${total} facturas · cobramos automáticamente`}
```

### N5-3 · Quick actions copy
Caso · Pequeño (30 min)

`dashboard/overview/Sections.tsx` — `getQuickActions()`:
- "Ver mis servicios" → "Ver servicios"
- "Ver mis facturas" → "Ver facturas"
- "Ayuda" → "Pedir ayuda"
- Añadir: "Lo que hemos hecho por ti" → `/dashboard/transparency`

---

## Refactor estructural (D5-3, D5-4, D5-9)

### N5-4 · Overview con tiles humanos
Caso · Mediano (4h)

Sustituir `<ClientStats>` (cards genéricas estilo SaaS) por tiles propios
del cliente. Estructura mostrada en `mockup/cliente/overview.html`:

```tsx
// frontend/app/dashboard/overview/StatsGrids.tsx → ClientStatusTiles.tsx
<div className={styles.tilesRow}>
  <Tile icon={<CheckIcon/>} label="Tu hosting" value="Está al aire"
        meta="Última copia hace 12 horas · sin incidencias." />
  <Tile icon={<InvoiceIcon/>} label="Tu próxima factura"
        value="49,90 €" meta="Se carga el 12 nov. Sin sorpresas." />
  <Tile icon={<ClockIcon/>} label="Lo último" value="Renovación SSL"
        meta="Hecho automáticamente · hace 2 horas." />
</div>
```

Voz: tiles en lenguaje humano. **Cero "MRR", "Active services", "ARR"**.

### N5-5 · Transparency a ListPage timeline
Caso · Pequeño (2h)

`dashboard/transparency/page.tsx` línea 63 — sustituir `<h1 style={...}>`
por `<ListPage variant="timeline" title="Lo que hemos hecho por ti"
subtitle="Últimos 30 días · todo lo que pasa con tus servicios, sin
tecnicismos." />`. Items renderizados con el componente Timeline (DD-027).

### N5-6 · Service detail con-aside variant
Caso · Mediano (4h)

`dashboard/services/[id]/page.tsx` migrar a:
```tsx
<DetailPage
  variant="with-aside"
  breadcrumb={[{label: 'Tus servicios', href: '/dashboard/services'},
               {label: service.domain}]}
  header={<ServiceHeader service={service} />}
  aside={<ServiceAside health={health} actions={actions} />}
>
  <ServiceContent service={service} />
</DetailPage>
```

El aside contiene: health-rombo dual (DD-024 funcional permitido por
DD-030), acciones rápidas, persona responsable.

---

## Saludo adaptativo (D5-5)

### N5-7 · Greeting reactivo al estado real
Caso · Pequeño (1h)

`dashboard/page.tsx` línea 31 — `getGreeting()`:

```tsx
function getGreeting(name: string, roleSlug: string,
                    alertCount: number): { title: string; subtitle: string } {
  const period = getPeriod();  // existente
  const title = `${period}, ${name}.`;

  let subtitle = 'Todo en orden con tus servicios.';
  if (roleSlug === 'client' && alertCount === 0) {
    subtitle = 'Todo en orden con tus servicios. Te resumimos cómo van las cosas.';
  } else if (roleSlug === 'client' && alertCount === 1) {
    subtitle = `Tienes 1 cosa que mirar. Te lo contamos abajo.`;
  } else if (roleSlug === 'client' && alertCount > 1) {
    subtitle = `Tienes ${alertCount} cosas que mirar. Te las contamos abajo.`;
  }
  // resto de roles…

  return { title, subtitle };
}
```

Empareja el copy con la realidad. Voz adaptativa, no estática.

---

## Página nueva (D5-8)

### N5-8 · Crear `/dashboard/settings`
Caso · Sprint propio

No existe en código. Diseñada en `mockup/cliente/settings.html` como
FormPage long-form con TOC:

- **Perfil** — cómo te llamamos, apellidos, email, teléfono.
- **Notificaciones** — 4 toggles con copy adaptado.
- **Facturación** — datos fiscales + método de pago.
- **Seguridad** — 2FA, login alerts, cambiar contraseña.
- **Privacidad** — descargar datos, gestionar consentimientos.
- **Cerrar cuenta** — danger zone con copy honesto.

Implementación tras N5-9 (intersection observer para TOC sticky).

### N5-9 · Hook `useScrollSpy` para TOC long-form
Caso · Pequeño (1h)

```tsx
// frontend/app/hooks/useScrollSpy.ts
export function useScrollSpy(ids: string[], threshold = 0.3) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => { /* IntersectionObserver */ }, [ids, threshold]);
  return active;
}
```

Reutilizable para futuras páginas long-form.

---

## Pipeline de copy en transparency (D5-12)

### N5-10 · Voz Aelium en eventos del backend
Caso · Mediano (4h)

Hoy los eventos llegan del backend con jerga técnica
(`SSL_RENEWED`, `BACKUP_COMPLETED`). Necesario un **diccionario de copy**
en frontend que los traduzca:

```ts
// frontend/app/dashboard/transparency/event-copy.ts
const EVENT_COPY: Record<EventType, (e: Event) => EventVoice> = {
  SSL_RENEWED: (e) => ({
    what: `Renovamos tu certificado SSL en ${e.domain}. Ya no caduca hasta el ${formatDate(e.newExpiry)}.`,
    actor: 'Aelium · automatización',
    extra: 'sin intervención humana',
    marker: 'success',
  }),
  BACKUP_COMPLETED: (e) => ({
    what: `Copia diaria completada. ${formatGB(e.size)} · ${formatDuration(e.elapsed)}. Sin errores.`,
    actor: 'Aelium · backup diario',
    marker: 'default',
  }),
  // ...todos los tipos cerrados, con copy revisado por humano.
};
```

**Lista cerrada** de tipos. Cada tipo tiene voz oficial. Si emerge un
evento sin copy, fallback genérico **"Aelium hizo algo en tu cuenta"** +
log alert al equipo (es señal de que falta voz).

---

## Decisiones cerradas en esta fase

### Voz "Tus" sustituye a "Mis"
El portal habla AL cliente. María entra a "Tus servicios" porque
Aelium se los presenta — no se los ofrece a sí misma. Coherente con
el slogan "Tu socio digital, a tu lado".

### Overview NO usa StatsCards
StatsCards son patrón válido para admin/agente (KPIs operativos). El
cliente no consume métricas — consume tranquilidad. Tiles propios con
copy humano hacen ese trabajo.

### Transparency es activo de marca diferenciador
Es la página que materializa P1 de marca ("Memoria del cliente — nunca
empieza de cero"). Recibe tratamiento especial: timeline detallada,
copy cuidado por evento, marker rombo (DD-027 + DD-030 funcional
permitido).

### Saludo adaptativo
"Buenos días, María — todo en orden" o "tienes X cosas que mirar".
La voz Aelium se adapta al estado real. Estática es perezosa.

### Settings con voz cuidada en cada toggle
No es lista de checkboxes técnicos. Cada toggle tiene un nombre humano
("Avisos de tu servicio") y una descripción explicando qué llega
(no "Enable notifications").

---

## Para fase 6 (agente)

### N5-11 · Reusar tiles humanos para overview de agente
El patrón "tiles propios" del overview cliente puede tener su versión
operativa para agente: "Tickets pendientes", "Clientes asignados", etc.
Distinta voz pero misma estructura.

### N5-12 · Voz "Mis" SÍ aplica al agente
"Mis tickets", "Mis clientes asignados" — el agente sí habla en
primera persona porque es su trabajo. La regla "Tus" es del cliente,
no del operador.

---

## Lo que esta fase NO entregó

- Implementación TS de los cambios (registrado arriba).
- Soporte / chat — pattern Workspace, fase propia.
- Checkout / onboarding wizard — fase propia.
- Estados de error (404, 500) — fase 10.
- Página de "Soporte" del cliente con conversación — depende de
  pattern Workspace.

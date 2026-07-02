# Audit · páginas cliente existentes (fase 5)

> Estado: **lectura cerrada · drift identificado**
> Fuentes auditadas:
> - `frontend/app/dashboard/page.tsx` (overview)
> - `frontend/app/dashboard/services/page.tsx`
> - `frontend/app/dashboard/billing/page.tsx`
> - `frontend/app/dashboard/transparency/page.tsx`
> - `frontend/app/dashboard/support/page.tsx`
> - `frontend/app/dashboard/services/[id]/page.tsx`
> - `frontend/app/dashboard/billing/[id]/page.tsx`

---

## Resumen ejecutivo

Las 6 páginas principales del cliente existen y son funcionales. Tras
las fases 2-4, el sistema ya tiene los patterns, componentes y shell
necesarios — pero las páginas no han sido auditadas con la voz Aelium
finalizada (DD-022) ni con los wrappers responsables (DD-031).

12 driftings identificados. La mayoría son **de copy** — el sistema
estructural está sano.

---

## D5-1 · Voz "Mis" vs "Tus" en titles del cliente

**Drift:** Las páginas usan **"Mis servicios"**, **"Mis facturas"**
en titles. La voz Aelium en el ClientShell ya usa **"Tus servicios"**,
**"Tus facturas"** — el portal habla AL cliente (voz de socio que
cuenta), no es el cliente hablando consigo mismo.

**Severidad:** Alta. Es la voz de marca aplicada al título de la página.

**Resolución:**

| Hoy | Aelium |
|---|---|
| Mis servicios | Tus servicios |
| Mis facturas | Tus facturas |
| Mi link (partner) | Tu enlace |
| Mis clientes (partner) | Tus clientes |

Coherencia con el sidebar (que ya dice "Tus servicios" / "Tus facturas"
en el spec ClientShell).

---

## D5-2 · Subtitle "Tus facturas y servicios contratados"

**Drift:** El subtitle de billing dice "Tus facturas y servicios
contratados" — mezcla dos conceptos. Servicios va aparte, billing es
solo facturas.

**Severidad:** Media.

**Resolución:** Subtitle de billing: voz que cuenta carga + orden, p.ej.
**"X facturas · ordena por fecha · cobramos automáticamente"**.

---

## D5-3 · Overview con StatsCards genéricos

**Drift:** El overview del cliente renderiza `<ClientStats>` con cards
estilo SaaS ("MRR: 49,90 €", "Activos: 4"). El cliente no es un
operador — esos números no le importan en abstracto.

**Severidad:** Alta. La overview del cliente debería responder a
**"¿todo va bien?"**, no a "¿cuál es mi MRR?".

**Resolución:** Tiles propios en lenguaje humano:
- ✅ "Tu hosting está al aire" (estado)
- ✅ "Tu próxima factura · 49,90 € · 12 nov"
- ✅ "Lo último: renovación SSL · hace 2 horas"
- ❌ "MRR · 49,90 €"
- ❌ "Active services · 4"

---

## D5-4 · Transparency con `<h1 style={{ fontSize: 24 }}>` inline

**Drift:** `transparency/page.tsx` renderiza `<h1 style={{ fontSize:
24, fontWeight: 700, margin: 0 }}>` con estilo inline en lugar de
usar PageHeader DS.

**Severidad:** Media. Drift contra DD-031 (wrappers responsables).

**Resolución:** Migrar a `<ListPage variant="timeline" title="Lo que
hemos hecho por ti" subtitle="Últimos 30 días · todo lo que pasa con
tus servicios" />`.

---

## D5-5 · Saludo "Buenos días, X" sin contexto Aelium

**Drift:** `getGreeting()` produce **"Buenos días, María. Aquí tienes
el estado de tus servicios."** — funciona pero es genérico SaaS.

**Severidad:** Baja. Es voz neutra, no incorrecta. Aceptable. Pero
podríamos elevar:

**Mejora propuesta:**
- Si hay alertas: **"Buenos días, María — tienes 1 cosa que mirar."**
- Si todo en orden: **"Buenos días, María — todo en orden."**

Voz adaptativa al estado real, no estática.

---

## D5-6 · Section "Novedades" vs "Alertas" cliente / staff

**Drift:** El código diferencia "Novedades" para cliente/partner
y "Alertas" para staff. Coherente. La copy del empty state
("Todo en orden", "Sin novedades pendientes. Todo va bien.") es
correcta voz Aelium.

**Severidad:** No es drift — está bien. Confirmamos en spec.

---

## D5-7 · Quick Actions cards estilo SaaS

**Drift:** Las quick actions del overview son `<Link>` con icono +
título + desc en cards rectangulares. Funciona. Voz puede mejorar.

**Severidad:** Baja.

**Resolución sugerida:**
- "Ver tus facturas" → "Ver facturas"
- "Ver tus servicios" → "Ver servicios"
- "Pedir ayuda" (en lugar de "Soporte" / "Help")
- "Lo que hemos hecho por ti" (entrada a transparency)

---

## D5-8 · Settings page no existe en cliente

**Drift:** El cliente no tiene `/dashboard/settings`. El profile
dropdown del topbar lleva a "Configuración" pero no hay página
implementada.

**Severidad:** Media. Producto incompleto.

**Resolución:** Diseñar `/dashboard/settings` como FormPage long-form
con TOC: Perfil · Notificaciones · Datos fiscales · Seguridad ·
Privacidad · Cerrar cuenta.

---

## D5-9 · Service detail sin aside con health

**Drift:** `services/[id]/page.tsx` muestra detalle como cards
apiladas. No usa DetailPage with-aside — no hay panel permanente con
estado de salud / acciones rápidas.

**Severidad:** Media.

**Resolución:** Migrar a `<DetailPage variant="with-aside">` con aside:
- Estado de salud (health-rombo dual)
- Acciones rápidas (renovar, cambiar plan, cancelar)
- Contacto del responsable (Julia M.)

---

## D5-10 · Invoice detail estructura

**Drift:** `billing/[id]/page.tsx` ya migrado a DetailPage standard
(D21 ✅ en UI_SPEC). Verificar que el copy siga voz Aelium.

**Severidad:** Baja. Mejora menor en copy.

**Resolución:** Header eyebrow **"Factura · {mes} {año}"**, meta
inline con voz humana.

---

## D5-11 · Empty states con voz Aelium

**Drift:** Los empty states usan voz correcta ("Aún no tienes
servicios", "Sin novedades — todo va bien"). Verificar consistencia.

**Severidad:** No es drift. Confirmamos.

---

## D5-12 · Transparency events copy

**Drift:** Los eventos del timeline en código actual usan voz
mixta (algunos técnicos: "SSL_RENEWED at 2026-...", otros humanos
"Backup completado").

**Severidad:** Media. La transparencia ES el activo de marca
diferenciador — todo evento debe ser humano.

**Resolución:** Pipeline de transformación de evento técnico → voz
Aelium en backend o en presentación. Lista cerrada de "voces" por tipo
de evento, gestionada por copy reviewer.

---

## Lista para NOTES.md (deudas TS/copy)

| ID | Drift | Sprint estimado |
|---|---|---|
| D5-1 | "Mis" → "Tus" en titles | Pequeño · 1h (sed +revisión) |
| D5-2 | Billing subtitle | Pequeño · 30 min |
| D5-3 | Overview con tiles humanos en lugar de StatsCards | Mediano · 4h (refactor de StatsGrids cliente) |
| D5-4 | Transparency a ListPage timeline | Pequeño · 2h |
| D5-5 | Saludo adaptativo según alertas | Pequeño · 1h |
| D5-7 | Quick actions copy | Pequeño · 30 min |
| D5-8 | Crear /dashboard/settings | Sprint propio (FormPage long-form completo) |
| D5-9 | Service detail con-aside variant | Mediano · 4h |
| D5-12 | Transparency events copy pipeline | Mediano · 4h (afecta backend) |

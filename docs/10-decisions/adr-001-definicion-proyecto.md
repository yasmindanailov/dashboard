# ADR-001 — Definición del proyecto y alcance

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §1
> **Domain:** foundation

---

## Contexto

Aelium opera servicios digitales (hosting, dominios, soporte gestionado, desarrollo web) y necesita una plataforma central para gestionar clientes, facturación, soporte y servicios técnicos. Hasta ahora se usa **WHMCS**, que tiene limitaciones críticas:

- Stack PHP heredado, difícil de extender con la lógica específica de Aelium (Support Inside con slots, We Do It For You como producto, partners con comisiones).
- UI no alineada con la marca; rebranding limitado.
- Acoplamiento fuerte con módulos de WHMCS que no se pueden sustituir cuando dejan de cumplir.
- Sin integración nativa con Docker / Enhance CP / ResellerClub bajo control directo.

Hace falta decidir: ¿seguir con WHMCS, comprar otro SaaS de billing, o construir uno propio?

---

## Opciones consideradas

1. **Mantener WHMCS** con plugins custom para los gaps.
   - Pros: cero coste de migración inmediato.
   - Contras: cada plugin custom amplifica el lock-in. Soporte de WHMCS marca el ritmo. Imposible alinear UX con la marca.

2. **Migrar a otro SaaS de billing** (Stripe Billing, Chargebee, Paddle, etc.).
   - Pros: dejar la operación a un proveedor maduro.
   - Contras: precios por suscripción + coste por transacción. No cubre el stack de soporte ni el modelo de Support Inside / WDIFY / partners. Hace falta conectar 4-5 SaaS distintos.

3. **(Elegida)** **Construir un dashboard propio** que reemplaza WHMCS y unifica billing, clientes, soporte, servicios técnicos y partners.
   - Pros: control total del modelo de datos y UX. Coste recurrente cero. Iteración a la velocidad del negocio.
   - Contras: trabajo de construcción significativo. Mantenimiento perpetuo a cargo del equipo.

---

## Decisión

**Aelium Dashboard:** plataforma propia que reemplaza WHMCS para la operación interna del negocio.

- **Naturaleza:** uso interno exclusivo (administradores, agentes, clientes finales y partners de Aelium). **No es un SaaS** que se venda a terceros — un solo negocio, un solo dashboard.
- **Operación:** España. Con cumplimiento de obligaciones fiscales españolas (Hacienda RD 1619/2012, RGPD, etc.).
- **Identidad:** marca Aelium v1.6. Color principal `#3B82F6`. Tipografía DM Sans (400/500/600). Eslogan: *"Tu socio digital, a tu lado."*
- **Referentes de UX:** WHMCS (función), hPanel de Hostinger (simplicidad), OVHcloud Manager (data-density). Stripe Dashboard como referencia visual.

---

## Consecuencias

- ✅ **Ganamos:**
  - Modelo de datos a medida del negocio (Support Inside con slots, WDIFY como proyecto, partners con comisiones automáticas).
  - UX que se alinea con la marca y se itera a la velocidad del equipo.
  - Cero coste de licencia recurrente.
  - Integración directa con Enhance CP, ResellerClub, Docker, Stripe, Claude API.
- ⚠️ **Aceptamos:**
  - El equipo es responsable del mantenimiento perpetuo.
  - Reproducir madurez (auditoría, edge cases legales) requiere disciplina (ADRs, tests, contracts).
  - Sin marketplace de plugins: lo que necesitemos lo construimos.
- 🚪 **Cierra:**
  - **No se va a vender este dashboard como SaaS.** No buscamos generalización. Decisiones de producto se toman para Aelium, no para clientes hipotéticos.

---

## Cuándo revisar

- Si Aelium decidiera vender el dashboard a terceros como SaaS multi-tenant. Hoy es decisión activa **no hacerlo** — al revisar habría que evaluar el coste de generalización.
- Si la madurez de un SaaS de billing alcanza el modelo de Aelium (Support Inside, partners, WDIFY) por menos coste anual que el mantenimiento del custom.

---

## Referencias

- **Módulos afectados:** todos.
- **Reglas relacionadas:** R5 (no lógica en frontend), R15 (límites de tamaño por archivo) — todas las reglas son consecuencia de esta decisión.
- **ADRs relacionados:** ADR-002 (stack backend), ADR-004 (arquitectura), ADR-008 (orden de construcción).
- **Glosario:** [Módulo](../00-foundations/glossary.md), [Plugin](../00-foundations/glossary.md).
- **Documento de marca:** `docs/aelium-documento-de-marca.md`.

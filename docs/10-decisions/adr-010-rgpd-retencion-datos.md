# ADR-010 — Cumplimiento RGPD y retención de datos

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §23 + §26
> **Domain:** foundation, legal

---

## Contexto

Aelium opera en España y trata datos personales (nombre, email, teléfono, dirección fiscal) de clientes finales y agencias partner. Sujeto al **Reglamento General de Protección de Datos (RGPD, UE 2016/679)** y a la **LOPDGDD** española.

Obligaciones que el sistema debe cumplir:

1. **Base legal explícita** para tratar datos (consentimiento, ejecución de contrato, obligación legal, interés legítimo).
2. **Retención limitada:** los datos se guardan solo el tiempo necesario para la finalidad, salvo obligación legal (Hacienda: facturas 10 años).
3. **Portabilidad:** el cliente puede exportar sus datos.
4. **Derecho al olvido:** el cliente puede solicitar borrado, salvo conflicto con obligación legal.
5. **Transparencia:** el cliente sabe qué datos tienes, qué haces con ellos, y a quién se los pasas (subprocesadores).
6. **Subprocesadores:** todos los terceros que reciben datos (Stripe, ResellerClub, Enhance CP, Sentry, etc.) tienen contrato DPA y se comunican al cliente.
7. **Audit log:** registro inmutable de accesos y cambios sobre datos personales.

Sin esto, el negocio incurre en sanciones (hasta 4% de facturación anual o 20 M€) y exposición reputacional.

---

## Opciones consideradas

1. **Mínimo legal explícito** — cumplir obligaciones documentalmente (texto legal en web) sin construir el sistema de transparencia.
   - Pros: rápido.
   - Contras: en una inspección, hay que demostrar que el sistema lo cumple. Sin trazabilidad, difícil.

2. **Compliance paranoico** — cifrar todo, anonimizar al máximo, expurgar agresivo.
   - Pros: protección máxima.
   - Contras: rompe casos de uso legítimos (analítica interna, soporte que necesita historial).

3. **(Elegida)** **Compliance pragmático con portal de transparencia.** Cumplir RGPD por diseño: retención por categoría, audit log inmutable, consentimiento granular para tracking opcional, portal de transparencia donde el cliente ve lo que pasa con sus datos.
   - Pros: cumplimos por diseño + UX positiva ("ves lo que hacemos con tus datos") + diferenciador frente a competidores opacos.
   - Contras: requiere construir más UI y modelar el consentimiento granular.

---

## Decisión

### Retención de datos (defaults configurables salvo obligación legal)

| Tipo de dato | Retención | Acción al cumplirse | Configurable |
|--------------|-----------|---------------------|--------------|
| Conversaciones cerradas (`conversations`, `messages`) | 2 años | Anonimización (PII removida, mensaje conservado) | Sí (settings) |
| Audit log (`audit_access_log`, `audit_change_log`) | 2 años | Borrado automático | **No** (obligación: trazabilidad mínima) |
| Datos de cuenta de cliente eliminado (User soft-deleted) | 5 años | Registro anonimizado (email hash, perfil null) | Sí |
| **Facturas** (`invoices`, `invoice_items`) | **10 años** | **Nunca se borran** | **No** (obligación Hacienda RD 1619/2012) |

> Implementación: cron jobs que evalúan retención y aplican la acción correspondiente.
> **Estado (2026-06-25, audit GL-5 / H3a):** el cron de **audit log** (`AuditRetentionCron`, nightly 03:00 UTC) **sí está implementado** y desde H3a purga **ambas** tablas — `audit_access_log` (`audit.access_retention_days`) **y** `audit_change_log` (`audit.change_retention_days`), default 730 días = 2 años AEPD (antes solo purgaba `access_log` → `change_log` acumulaba PII sin límite). Los demás crons de retención (anonimización de conversaciones cerradas a 2 años, anonimización de cuentas de cliente eliminadas a 5 años) **siguen pendientes** (sprint dedicado de RGPD / portal de transparencia — GL-5 parte 2).

### Consentimiento granular

Tres niveles, cada uno opt-in/opt-out independiente:

```
INTEGRACIONES TÉCNICAS NECESARIAS    (no desactivables)
  Stripe · ResellerClub · Enhance CP · Docker API
  Sin estas el servicio no puede funcionar — se documentan, no se piden.

ANALÍTICAS DE USO INTERNO            (opt-in/opt-out)
  Cómo usa el cliente el dashboard. Solo para Aelium. Nunca a terceros.

ANALÍTICAS DE TERCEROS               (opt-in/opt-out)
  Google Analytics, Plausible, etc.
  Si el cliente opta out → el sistema NO envía sus datos a esa integración.
  Cada intento de envío y la validación del consentimiento queda en audit log.
```

### Portal de transparencia del cliente

Página en el dashboard del cliente que muestra:

- **Mis datos:** qué tiene Aelium sobre mí (descargable como JSON / CSV).
- **Quién accede:** lista de integraciones externas que han accedido a mis datos en los últimos N días, con nombre legible, descripción, ubicación geográfica, política de privacidad del proveedor.
- **Mis preferencias:** opt-in/opt-out de las analíticas, configurable.
- **Mis derechos:** botones de "exportar mis datos", "solicitar borrado de mi cuenta".

> El catálogo de integraciones (descripciones legibles, RGPD compliance, links) lo gestiona el superadmin en settings. El registro de accesos es **automático e inmutable** (audit log).

### Audit log inmutable (Regla R3)

Tablas `audit_access_log` (lecturas a recursos sensibles) y `audit_change_log` (escrituras) **solo permiten INSERT**. Ni el superadmin tiene permisos de UPDATE/DELETE. Detalle en ADR-017.

### Subprocesadores

Documento legal en el sistema (settings.legal.subprocessors) editable por el superadmin. Lista de:

- Stripe (pagos)
- ResellerClub (dominios)
- Enhance CP (hosting)
- Sentry (observabilidad — cuando esté activo)
- MinIO operado por Aelium (storage propio, técnicamente no subprocesador externo)
- Anthropic (Claude API — cuando IA esté activa)

Cada subprocesador con: nombre, finalidad, ubicación de los datos, link a su DPA.

---

## Consecuencias

- ✅ **Ganamos:**
  - Cumplimiento RGPD por diseño.
  - Diferenciador positivo: el cliente VE lo que pasa con sus datos (vs competidores opacos).
  - Trazabilidad ante inspección de la AEPD.
  - Audit log inmutable es defensa frente a "alguien borró el registro".
- ⚠️ **Aceptamos:**
  - Construir el portal de transparencia es trabajo significativo (sprint dedicado pendiente).
  - Crons de retención automatizada son crítica y a la vez deuda actual.
  - Mantener el catálogo de subprocesadores actualizado requiere disciplina.
- 🚪 **Cierra:**
  - **No vendemos datos a terceros.** Punto.
  - **No ocultamos al cliente quién accede a sus datos.**

---

## Cuándo revisar

- Si Aelium se internacionaliza fuera de la UE: revisar GDPR aplicable + leyes locales (CCPA en California, LGPD en Brasil, etc.).
- Si el sistema acepta clientes B2B con sus propios subprocesadores (caso partners + sus clientes): revisar cadena de DPAs.
- Si la AEPD publica directrices nuevas que modifiquen requisitos.

---

## Referencias

- **Módulos afectados:** auth, clients, billing, support, audit, todos los que tratan datos personales.
- **Reglas relacionadas:** R3 (audit inmutable), R12 (credenciales encriptadas).
- **ADRs relacionados:** ADR-017 (audit log inmutable), ADR-031 (Stripe como subprocesador), ADR-007 (Sentry como subprocesador opcional).
- **Glosario:** [Audit log](../00-foundations/glossary.md).
- **Documentos legales:** política de privacidad y T&C son editables desde el dashboard por el superadmin (settings.legal.*).

# ResellerClub API — Hallazgos del research (Sprint 15D.B0)

> **Fecha:** 2026-05-22. **Método:** ver [README.md](./README.md).
> **Rama:** `sprint15d-fase-b0-research-ote`.

## Estado del research

| Dimensión | Estado | Fuente |
|---|---|---|
| Endpoints + métodos + **params** del scope v1 | ✅ **Completo** | Wrappers en producción [`phillipsdata/logicboxes`](https://github.com/phillipsdata/logicboxes) (doc inline) + dossier §4 |
| Formato de transporte (URL, auth, JSON, arrays) | ✅ **Confirmado** | Wrapper `logicboxes_api.php` |
| Comportamiento del WAF (Cloudflare) | ✅ **Verificado empíricamente** (ver §3) | Llamadas reales (curl + fetch) |
| **Shapes de respuesta exactos + códigos de error de la API** | ⏳ **Pendiente** | Requiere verificación empírica contra OT&E con **IP estable** (§4) |

**Por qué la verificación empírica quedó pendiente:** las llamadas a OT&E desde el entorno de desarrollo se hicieron por **datos móviles + hotspot en movimiento (CGNAT)**, cuya IP pública **rota constantemente** (`31.4.129.23` → `.43` → `.126` en minutos). El whitelist de IP de RC tarda 30–60 min en propagar — más de lo que dura cada IP. Es una limitación de **red del entorno**, no del proyecto ni del script. Se completa con IP estable (conexión fija / VPN con IP dedicada) o en el **smoke pre-cierre (Fase G)** / deploy (servidor con IP fija). El script `backend/scripts/research-resellerclub-ote.ts` queda **listo** para ese momento.

---

## 1. Transporte (verificado en `logicboxes_api.php`)

- **URL base:** OT&E `https://test.httpapi.com/api/` · producción `https://httpapi.com/api/`.
- **Patrón:** `<base><command>.<format>` con `format = json` (constante `RESPONSE_FORMAT`). Ej.: `https://test.httpapi.com/api/domains/available.json`.
- **Auth:** `auth-userid` (Reseller Id) + `api-key` en **cada** request — en querystring (GET) o body `application/x-www-form-urlencoded` (POST).
- **Arrays** (p. ej. `ns`): se envían como **claves duplicadas** — `ns=ns1.aelium.net&ns=ns2.aelium.net` (no `ns[]`).
- **Errores de negocio:** la API responde **HTTP 200** con `{ "status": "ERROR", "message": "<detalle>" }` (a confirmar el shape exacto en §4).

---

## 2. Endpoints del scope v1 core (params desde wrappers)

> Marcado: ⚙️ ciclo de vida (vía `provision`) · 🧑 inline action · 🛠️ admin · 🔎 pre-venta. Mapeo al contrato de registrar en [ADR-077 A10](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md).

| Endpoint | Método | Params clave | Notas |
|---|---|---|---|
| `domains/available` 🔎 | GET | `domain-name`, `tlds[]`, `suggest-alternative?` | Disponibilidad single/bulk. Pre-flight de **DOM-INV-1**. |
| `domains/suggest-names` 🔎 | GET | `keyword`, `tlds[]`, `no-of-results`, `hyphen-allowed?`, `add-related?` | Buscador rico (15D.II). |
| `products/reseller-price` 🔎 | GET | (cuenta) | **Coste mayorista** → guardia de margen DOM-INV-3. *Endpoint a confirmar empíricamente.* |
| `products/customer-price` 🔎 | GET | (cuenta) | Precio sugerido al customer. *Idem.* |
| `customers/signup` ⚙️ | POST | `username`(email), `passwd`, `name`, `company`, `address-line-1`, `city`, `state`, `country`, `zipcode`, `phone-cc`, `phone`, `lang-pref` | Lazy-create → devuelve `customer-id`. Tabla `resellerclub_customers`. |
| `customers/details` / `details-by-id` | GET | `username` / `customer-id` | Cross-search defensivo (DOM-INV-1 a nivel customer). |
| `contacts/add` ⚙️ | POST | `name`, `company`, `email`, `address-line-1`, `city`, `country`, `zipcode`, `phone-cc`, `phone`, `customer-id`, `type`, `attr-name`/`attr-value` | `type ∈ {Contact, EsContact, EuContact, UkContact, ...}`. **`.es`:** `attr` `es_tipo_identificacion` (1=NIF/DNI, 3=NIE, 0=otro) + `es_identificacion` → **DOM-INV-5 elegibilidad**. Devuelve `contact-id`. |
| `domains/register` ⚙️ | POST | `domain-name`, `years`, `ns[]`, `customer-id`, `reg-contact-id`, `admin-contact-id`, `tech-contact-id`, `billing-contact-id`, `invoice-option`, `protect-privacy`, `attr-name`/`attr-value` | `invoice-option ∈ {NoInvoice, PayInvoice, KeepInvoice}`. Para **`.eu/.uk/.nz/.ru`** pasar `-1` en admin/tech/billing-contact-id. NS por defecto = `provisioning.default_nameservers` (Aelium). |
| `domains/renew` ⚙️ | POST | `order-id`, `years`, `exp-date`, `invoice-option` | **`exp-date`** (epoch del vencimiento actual) requerido → verificar **DOM-INV-4** (releer `details` antes/después). |
| `domains/details` / `details-by-name` | GET | `order-id` / `domain-name`, `options` | `options` (p. ej. `All`/`OrderDetails`/`ContactIds`/`NsDetails`) controla el detalle. Fuente de `getServiceInfo` + `expires_at`. |
| `domains/modify-ns` 🧑 | POST | `order-id`, `ns[]` | Acción curada peligrosa (confirm). |
| `domains/modify-contact` 🧑 | POST | `order-id`, `reg-contact-id`, `admin-contact-id`, `tech-contact-id`, `billing-contact-id` | |
| `domains/modify-privacy-protection` 🧑 | POST | `order-id`, `protect-privacy`(bool), `reason` | WHOIS privacy ON/OFF. No soportado en algunos TLDs (`.es`, `.eu`, `.nl`, ... — ver lista en wrapper). |
| `domains/modify-auth-code` 🧑 | POST | `order-id`, `auth-code` | EPP/auth code (para transfer-out). |
| `domains/enable-theft-protection` / `disable-theft-protection` 🧑 | POST | `order-id` | Registrar lock ON/OFF. |
| `orders/suspend` 🛠️ | POST | `order-id`, `reason` | Admin (impago/fraude). |
| `orders/unsuspend` 🛠️ | POST | `order-id` | Admin. |

> Diferido a 15D.II (no en scope core): `domains/transfer`, `validate-transfer`, `resend-rfa`, `cancel-transfer` (transfer-in FSM) · `domains/add-cns`/`modify-cns-*` (child NS) · `domains/restore` (redemption) · `domains/idn-available` (IDN) · domain forwarding.

---

## 3. ⚠️ Hallazgo crítico (verificado empíricamente): WAF de Cloudflare

`httpapi.com` está detrás de **Cloudflare**. Las peticiones desde una **IP no whitelisteada** reciben **HTTP 403 con una página HTML de Cloudflare** ("Attention Required! · Please enable cookies"), **no** un error JSON de la API — el WAF actúa **antes** de la aplicación. Confirmado con `curl` **y** `fetch` (independiente del cliente y del User-Agent).

**Implicaciones para el cliente HTTP del plugin (15D.C / producción):**
1. La **IP del servidor** debe estar whitelisteada en RC (Settings → API; hasta 3 IPs). Documentar como paso de despliegue (P-DEPLOY).
2. Enviar un **User-Agent realista** en las requests (las peticiones sin UA "de servidor" son más propensas al challenge).
3. El cliente debe **distinguir el 403-HTML de Cloudflare** (config: IP no whitelisteada) de los errores JSON de la API → mapear a `PROVIDER_AUTH_FAILED` (retriable=false) **+ alerta admin** ([ADR-077 A10](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md)), no a un error genérico. Heurística: `Content-Type: text/html` + cuerpo con `cloudflare`/`Attention Required` ⇒ problema de whitelist, no de la API.

Este hallazgo **no estaba en el catálogo del dossier** — es justo el valor de la verificación empírica (lección L20).

---

## 4. Pendiente de verificación empírica (con IP estable)

Capturar con `research-resellerclub-ote.ts` (ya escrito) cuando haya IP estable:
- **Shape exacto de respuesta** de: `available` (¿`{domain: {status: 'available'|'regthroughothers'|...}}`?), `signup` (¿devuelve el `customer-id` como número plano?), `register` (¿`{entityid, ...}`? cómo viene el order-id), `details`/`details-by-name` (campos de estado/expiración/NS/contactos/locks → mapeo a `ServiceInfoStatus` y `expires_at`).
- **Códigos/mensajes de error reales** de RC → afinar el mapeo a los 7 `ProvisionerErrorCode` de dominio ([ADR-077 A10](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md)): dominio no disponible, premium, registrant inelegible (`.es` sin NIF), redemption, lock activo.
- **Endpoint de pricing** correcto (`reseller-price` vs `customer-price`) y su shape (matriz TLD × años) para `getTldPricing` → `domain_tld_pricing`.
- Confirmar `invoice-option=NoInvoice` como vía canónica para que Aelium controle la facturación (no RC).

Hasta entonces, el `MockResellerClubServer` (15D.C) se construye con shapes **conservadores** derivados de wrappers + dossier + módulos WHMCS/Blesta, y se **refina** tras la captura empírica (smoke Fase G).

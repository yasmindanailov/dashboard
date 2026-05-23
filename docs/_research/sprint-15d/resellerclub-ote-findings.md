# ResellerClub API — Hallazgos del research (Sprint 15D.B0)

> **Fecha:** 2026-05-22. **Método:** ver [README.md](./README.md).
> **Rama:** `sprint15d-fase-b0-research-ote`.

## Estado del research

| Dimensión | Estado | Fuente |
|---|---|---|
| Endpoints + métodos + **params** del scope v1 | ✅ **Completo** | Wrappers en producción [`phillipsdata/logicboxes`](https://github.com/phillipsdata/logicboxes) (doc inline) + dossier §4 |
| Formato de transporte (URL, auth, JSON, arrays) | ✅ **Confirmado** | Wrapper `logicboxes_api.php` |
| Comportamiento del WAF (Cloudflare) | ✅ **Verificado empíricamente** (ver §3) | Llamadas reales (curl + fetch) |
| Shapes: pre-venta (`available`) + pricing (`reseller`/`customer-price`) + customer/contact + **2 envoltorios de error** | ✅ **Verificado empíricamente** (§4) | OT&E real, IP fija whitelisteada, 2026-05-22 |
| Shapes register-dependientes (`register`/`details`/gestión/`renew`/suspend) | ⏳ **Pendiente** (smoke Fase G) | Bloqueado por **infra DNS** de nameservers (§4.8) |

**Verificación empírica — ejecutada parcialmente (2026-05-22, IP fija).** Con la IP whitelisteada, `research-resellerclub-ote.ts` corrió contra OT&E y capturó los shapes reales de pre-venta, pricing, customer/contact y los **dos envoltorios de error** de RC (§4). El intento previo por CGNAT móvil (IP rotatoria `31.4.129.23`→`.43`→`.126`, más rápida que la propagación del whitelist) queda superado.

**Lo que NO se pudo capturar y por qué (§4.8):** los shapes register-dependientes (`register`/`details`/gestión) están bloqueados porque OT&E **valida los nameservers resolviéndolos en DNS** y `ns1/ns2.aelium.net` **no tienen registro A** (Aelium pre-producción; verificado con `Resolve-DnsName` → "no existe"). Ni los NS de producción ni los públicos de IANA pasan; la cuenta OT&E está además vacía (`domains/search` → `recsindb:0`), así que tampoco hay un dominio existente del que leer `details`. **Es un prerequisito de infraestructura** (los nameservers de Aelium deben existir en DNS), no un ajuste del panel RC ni del script → se cierra en el **smoke de Fase G** / post-deploy. El script queda listo (`RESELLERCLUB_OTE_NS` configurable).

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

## 4. Shapes verificados empíricamente (OT&E real — 2026-05-22)

> Capturados por `research-resellerclub-ote.ts` contra `test.httpapi.com` con IP fija whitelisteada. Raw local en `ote-raw-capture.json` (gitignored — datos demo, sin credenciales). Los shapes register-dependientes (§4.8) siguen pendientes del smoke Fase G.

### 4.1 `domains/available` — HTTP 200, objeto por FQDN
```json
{
  "miempresa.com": { "classkey": "domcno", "status": "available" },
  "google.com":    { "classkey": "domcno", "status": "regthroughothers" }
}
```
- Clave = FQDN; valor = `{ classkey, status }`. `status`: `available` | `regthroughothers` (registrado por otros = **no** disponible).
- **DOM-INV-1 pre-flight**: `status !== 'available'` ⇒ `DOMAIN_UNAVAILABLE`.

### 4.2 `classkey` por TLD (clave de unión availability ↔ pricing)
| TLD | `classkey` |
|---|---|
| `.com` | `domcno` |
| `.net` | `dotnet` |
| `.org` | `domorg` |
| `.es` | `dotes` |
| `.eu` | `doteu` |

El `classkey` de `available` **coincide con la clave de producto** de `reseller-price`/`customer-price` (verificado en el raw para los 5 TLDs) → es la clave canónica para mapear RC ↔ nuestros TLDs (no el TLD literal).

### 4.3 `products/reseller-price` — HTTP 200 (**COSTE** mayorista)
```json
{
  "domcno": {
    "0": {
      "pricing": {
        "addnewdomain":      { "1": "38.81" },
        "renewdomain":       { "1": "38.81" },
        "addtransferdomain": { "1": "38.81" },
        "restoredomain":     { "1": "44.49" }
      },
      "category": { "category1": { "name": "receipts", "quantity": "0.00" }, "…": {} }
    },
    "privacy-protection": "0.0",
    "premium_dns": "4.0"
  }
}
```
- Clave = product-key (== `classkey`). Precios como **string**, anidados bajo el slab `"0"` → `pricing.<op>.<years>`. Ops: `addnewdomain` (register), `renewdomain`, `addtransferdomain`, `restoredomain`. Más `privacy-protection`/`premium_dns` como hermanos del slab.
- **Este es el COSTE** sobre el que el cron aplica `markup_percent` y el margin guard **DOM-INV-3** compara.

### 4.4 `products/customer-price` — HTTP 200 (precio **sugerido** por RC)
```json
{
  "domcno": {
    "addnewdomain": { "1": 42.34, "2": 42.34, "…": "…", "10": 42.34 },
    "renewdomain":  { "1": 42.34, "…": "…", "10": 42.34 },
    "addtransferdomain": { "1": 42.34 },
    "restoredomain":     { "1": 48.54 }
  }
}
```
- Clave = product-key. Precios como **number**, por años `1..10`, **sin** slab `"0"` ni `category`. Es el precio que **RC sugiere cobrar al cliente** — NO es nuestro coste.
- ⇒ **Resuelve la ambigüedad de [ADR-081 §8](../../10-decisions/adr-081-plugin-resellerclub-specifics.md)**: `getTldPricing()` (coste para DOM-INV-3) debe leer **`reseller-price`**, no `customer-price`. Materializado en [ADR-081 Amendment A1](../../10-decisions/adr-081-plugin-resellerclub-specifics.md#amendments).

### 4.5 `customers/signup` / `contacts/add` — HTTP 200, **id escalar**
- Devuelven el id como **número plano** en el body (no objeto): p. ej. `33566240` (customer-id) / `134143114` (contact-id). El cliente debe parsear escalar (no `{id}`).

### 4.6 `customers/details` (no existe) — HTTP 500 + envoltorio de error
```json
{ "status": "ERROR", "message": "Customer ote.…@aelium.test not found" }
```
- "No existe" llega como **HTTP 500** (no 404). El cross-search defensivo (DOM-INV-1 a nivel customer) trata "not found" como "crear", no como fallo duro.

### 4.7 ⚠️ DOS envoltorios de error de negocio (CRÍTICO para el http-client)
RC responde con **dos** shapes de error según el comando:
```json
{ "status": "ERROR", "message": "…" }   // mayúscula — la mayoría de comandos
{ "status": "error", "error":   "…" }   // minúscula — p. ej. domains/register
```
- El http-client (15D.C) debe detectar **ambos** (`String(status).toLowerCase() === 'error'`) y extraer el detalle de `message` **o** `error` antes de mapear a `ProvisionerErrorCode`. Llegan con HTTP 200 **y** con HTTP 500 (no fiarse solo del status HTTP).

### 4.8 ⏳ Pendiente (smoke Fase G) — register-dependiente
`register` exige nameservers que **resuelvan en DNS** (RC los valida): rechaza `ns1/ns2.aelium.net` (sin registro A en pre-producción — confirmado por `Resolve-DnsName`) e incluso los públicos de IANA, con `{status:"error", error:"NameServer … is not a valid Nameserver"}`. La cuenta OT&E está vacía (`domains/search` → `{recsonpage:"0", recsindb:"0"}`), así que tampoco hay un dominio existente del que leer `details`. Bloquea la captura de:
- `register` OK (¿campo del order-id — `entityid`?), `details`/`details-by-name` (ejes de estado, `endtime`, NS, contactos, locks → `ServiceInfoStatus` + `expires_at`), `modify-*`, `renew`, `orders/suspend|unsuspend`.
- **Prerequisito (P-DEPLOY + smoke)**: que `ns1/ns2.aelium.net` existan en DNS con registro A (infra de nameservers de Aelium). Luego `RESELLERCLUB_OTE_NS=ns1.aelium.net,ns2.aelium.net pnpm --dir backend exec ts-node --transpile-only scripts/research-resellerclub-ote.ts`.
- Aparte: `domains/suggest-names` está **deprecado** → `/domains/v5/suggest-names` (afecta solo al buscador rico de **15D.II**).

Hasta el smoke, el `MockResellerClubServer` modela estos shapes de forma **conservadora** (wrappers `phillipsdata/logicboxes` + dossier + módulos WHMCS/Blesta) — [ADR-081 §11](../../10-decisions/adr-081-plugin-resellerclub-specifics.md).

# DATABASE_SCHEMA.md — Aelium Dashboard
> Schema de la base de datos.
> Versión 1.1 | Abril 2026
>
> **Fuente de verdad implementada:** `backend/prisma/schema.prisma`
> **Este documento:** diseño de referencia. Se actualiza al implementar cada sprint.
>
> **Schema principal:** `public`
> **Schema de audit:** `audit` (solo INSERT, nunca UPDATE ni DELETE)
>
> Convenciones:
> - Todos los IDs son `uuid` generados por la base de datos (gen_random_uuid())
> - Todos los timestamps son `timestamptz` (con zona horaria)
> - `created_at` y `updated_at` en todas las tablas mutables
> - Los campos desnormalizados intencionalmente están marcados con ⚠️ desnormalizado
> - FK = Foreign Key · PK = Primary Key · UQ = Unique
> - ✅ = Implementado en Prisma · ⬜ = Pendiente de implementar en su sprint

---

## BLOQUE 1 — USUARIOS Y AUTENTICACIÓN ✅

> Implementado en Sprint 0 y Sprint 1. Todo este bloque está en Prisma.

---

### `roles` ✅
Definición de roles del sistema. Usa enum `RoleSlug` como identificador único.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| slug | enum RoleSlug | NOT NULL, UQ | superadmin · agent_full · agent_billing · agent_support · client · partner_pending · partner |
| name | varchar(100) | NOT NULL | Nombre visible: "Superadmin", "Cliente", etc. |
| description | text | NULLABLE | |
| permissions | json | DEFAULT '[]' | Permisos granulares (futuro) |
| is_system | boolean | DEFAULT false | true = no editable desde UI |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Datos iniciales (seed):** 7 roles — ver `backend/prisma/seed.ts`

---

### `users` ✅
Todos los usuarios del sistema — clientes, agentes, partners, y superadmin.
Relación directa con `roles` via FK (un usuario = un rol).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| email | varchar(255) | NOT NULL, UQ | |
| password_hash | varchar(500) | NOT NULL | Bcrypt 12 rounds. Nunca en claro. |
| first_name | varchar(100) | NOT NULL | |
| last_name | varchar(100) | NOT NULL | |
| status | enum UserStatus | NOT NULL, DEFAULT 'pending_verification' | pending_verification · active · blocked · inactive |
| email_verified_at | timestamptz | NULLABLE | null = no verificado |
| login_attempts | integer | NOT NULL, DEFAULT 0 | Se resetea al hacer login exitoso |
| blocked_until | timestamptz | NULLABLE | Bloqueo temporal tras N intentos fallidos (configurable) |
| last_login_at | timestamptz | NULLABLE | Se actualiza en cada login exitoso |
| last_login_ip | varchar(45) | NULLABLE | IPv4 o IPv6 |
| two_factor_enabled | boolean | DEFAULT false | |
| two_factor_secret | varchar(500) | NULLABLE | Hash SHA-256 del código 2FA activo (single-use) |
| avatar_url | varchar(1000) | NULLABLE | URL de la imagen de perfil (MinIO) |
| language | varchar(5) | DEFAULT 'es' | Idioma del dashboard |
| timezone | varchar(50) | DEFAULT 'Europe/Madrid' | Zona horaria para mostrar fechas |
| role_id | uuid | NOT NULL, FK → roles(id) | Relación directa, sin tabla pivote |
| partner_id | uuid | NULLABLE | Si el usuario fue creado por un partner |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | Auto-update |

**Índices:**
- `idx_users_email` — UNIQUE en email
- `idx_users_role_id` — en role_id
- `idx_users_status` — en status

**Notas de decisión:**
- El superadmin solo se crea via seed. Nunca desde la UI.
- `blocked_until` usa bloqueo temporal (15 min por defecto, configurable en settings).
- 2FA obligatorio para superadmin y agentes (código por email, single-use).
- El código 2FA se guarda hasheado en `two_factor_secret` y se borra tras uso.

---

### `sessions` ✅
Sesiones activas. No se eliminan, se marcan como `is_active = false`.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE | |
| token_hash | varchar(500) | NOT NULL, UQ | Hash SHA-256 del access token |
| refresh_hash | varchar(500) | NOT NULL, UQ | Hash SHA-256 del refresh token |
| ip_address | varchar(45) | NOT NULL | |
| user_agent | varchar(1000) | NULLABLE | |
| device_label | varchar(200) | NULLABLE | "Windows", "Mobile", "Mac" (parseado) |
| is_active | boolean | DEFAULT true | false = sesión cerrada o revocada |
| last_used_at | timestamptz | NOT NULL, DEFAULT now() | Se actualiza en cada refresh |
| expires_at | timestamptz | NOT NULL | Configurable en settings |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_sessions_user_id` — en user_id
- `idx_sessions_is_active` — en is_active

**Notas de decisión:**
- Las sesiones no se eliminan para mantener historial de accesos.
- El superadmin y el cliente pueden cerrar sesiones activas desde el dashboard.
- Access token: 15 min (configurable). Refresh token: 7 días (configurable).

---

### `email_verifications` ✅
Tokens para verificación de email al registrarse.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE | |
| token_hash | varchar(500) | NOT NULL, UQ | Hash SHA-256 del token (el token real va en el email) |
| expires_at | timestamptz | NOT NULL | 24 horas (configurable en settings) |
| used_at | timestamptz | NULLABLE | null = no usado aún |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_email_verifications_user_id` — en user_id

---

### `password_resets` ✅
Tokens para recuperación de contraseña.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE | |
| token_hash | varchar(500) | NOT NULL, UQ | Hash SHA-256 |
| expires_at | timestamptz | NOT NULL | 1 hora (configurable en settings) |
| used_at | timestamptz | NULLABLE | |
| ip_address | varchar(45) | NOT NULL | IP desde donde se solicitó |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_password_resets_user_id` — en user_id

---

## BLOQUE 2 — CLIENTES Y PERFIL

> `client_profiles` ✅ implementado (Sprint 0).
> `billing_profiles` ⬜ se expandirá en Sprint 4 (Clients) — requisito de negocio crítico.
> Tablas de organización (folders, tags, consents) ⬜ se implementan en sprints futuros.

---

### `client_profiles` ✅
Perfil del cliente. Datos de facturación, contacto y notas internas.
Cada cliente tiene exactamente un perfil (1:1 con `users`).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE, UQ | |
| client_type | enum ClientType | DEFAULT 'individual' | individual · company |
| company_name | varchar(300) | NULLABLE | Solo si company |
| tax_id | varchar(20) | NULLABLE | NIF/CIF. Obligatorio para company. |
| phone | varchar(20) | NULLABLE | |
| address_line1 | varchar(500) | NULLABLE | |
| address_line2 | varchar(500) | NULLABLE | |
| city | varchar(100) | NULLABLE | |
| state | varchar(100) | NULLABLE | |
| postal_code | varchar(10) | NULLABLE | |
| country | varchar(2) | DEFAULT 'ES' | ISO 3166-1 alpha-2 |
| billing_email | varchar(255) | NULLABLE | Email alternativo para facturas |
| notes_internal | text | NULLABLE | Notas internas del equipo. No las ve el cliente. |
| stripe_customer_id | varchar(200) | NULLABLE | ID en Stripe |
| credit_balance | decimal(10,2) | DEFAULT 0 | Saldo a favor del cliente |
| metadata | json | NULLABLE | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

> **⚠️ Limitación actual:** Un solo perfil de facturación por cliente.
> En Sprint 4 se creará la tabla `billing_profiles` (múltiples por cliente)
> según DECISIONS.md: "El cliente puede tener perfil personal, autónomo y empresa simultáneamente."

---

### `billing_profiles` ⬜ Sprint 4 (Clients)
Perfiles de facturación del cliente. Un cliente puede tener varios.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE | |
| type | enum | NOT NULL | personal · autonomo · empresa |
| label | varchar(100) | NOT NULL | Nombre interno del cliente: "Mi empresa", "Personal" |
| first_name | varchar(100) | NULLABLE | Para personal y autónomo |
| last_name | varchar(100) | NULLABLE | Para personal y autónomo |
| company_name | varchar(200) | NULLABLE | Para empresa |
| nif_cif | varchar(20) | NULLABLE | Obligatorio para autónomo y empresa. Opcional para personal. |
| address_line1 | varchar(255) | NOT NULL | |
| address_line2 | varchar(255) | NULLABLE | |
| city | varchar(100) | NOT NULL | |
| postal_code | varchar(20) | NOT NULL | |
| country | varchar(2) | NOT NULL, DEFAULT 'ES' | ISO 3166-1 alpha-2 |
| is_default | boolean | NOT NULL, DEFAULT false | Solo uno puede ser true por usuario |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_billing_profiles_user_id` — en user_id
- `idx_billing_profiles_default` — PARTIAL UNIQUE en (user_id) WHERE is_default = true

**Notas de decisión:**
- Sin NIF → se genera factura simplificada.
- El cliente puede tener perfil personal (sin NIF), autónomo (NIF obligatorio) y empresa (CIF obligatorio) simultáneamente.

---

### `client_consents` ⬜ Sprint 4 (Clients)
Consentimientos de analíticas y privacidad por cliente.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE | |
| consent_type | enum | NOT NULL | internal_analytics · third_party_analytics |
| granted | boolean | NOT NULL, DEFAULT false | |
| granted_at | timestamptz | NULLABLE | |
| revoked_at | timestamptz | NULLABLE | |
| ip_address | inet | NULLABLE | IP en el momento de la decisión |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- UNIQUE(user_id, consent_type)

**Notas de decisión:**
- Las integraciones técnicas necesarias (Stripe, Enhance CP, etc.) no aparecen aquí. Siempre activas.
- Antes de enviar datos a integraciones no esenciales, el sistema valida esta tabla.

---

### `client_folders` ⬜ Sprint 4 (Clients)
Carpetas opcionales creadas por el cliente para organizar sus servicios.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------| ------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE | |
| name | varchar(100) | NOT NULL | |
| color | varchar(7) | NULLABLE | Color hex: #3B82F6 |
| order_index | integer | NOT NULL, DEFAULT 0 | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

---

### `client_service_folders` ⬜ Sprint 4 (Clients)
Relación entre servicios y carpetas del cliente.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| service_id | uuid | NOT NULL, FK → services(id) ON DELETE CASCADE, UQ | Un servicio en una sola carpeta |
| folder_id | uuid | NOT NULL, FK → client_folders(id) ON DELETE CASCADE | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

---

### `client_service_tags` ⬜ Sprint 4 (Clients)
Etiquetas opcionales del cliente sobre sus servicios.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE | |
| service_id | uuid | NOT NULL, FK → services(id) ON DELETE CASCADE | |
| tag | varchar(50) | NOT NULL | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- UNIQUE(service_id, tag)

---

## BLOQUE 3 — PRODUCTOS Y CATÁLOGO ⬜ Sprint 5 (Products)

> Tablas en Prisma como stub. Se expanderán con `product_pricing` (múltiples ciclos) en su sprint.

---

### `product_categories`
Categorías y subcategorías del catálogo. Opcionales y configurables.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| name | varchar(100) | NOT NULL | |
| slug | varchar(100) | NOT NULL, UQ | |
| parent_id | uuid | NULLABLE, FK → product_categories(id) | null = categoría raíz |
| order_index | integer | NOT NULL, DEFAULT 0 | |
| active | boolean | NOT NULL, DEFAULT true | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_product_categories_parent` — en parent_id
- `idx_product_categories_slug` — UNIQUE en slug

---

### `products`
Catálogo de productos. 100% dinámico. Ningún producto hardcodeado.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| category_id | uuid | NULLABLE, FK → product_categories(id) | |
| name | varchar(200) | NOT NULL | |
| slug | varchar(200) | NOT NULL, UQ | |
| description | text | NULLABLE | |
| short_description | varchar(500) | NULLABLE | |
| type | enum | NOT NULL | hosting_web · domain · docker_service · support_addon · support_service · custom_service |
| provisioner | enum | NOT NULL | enhance_cp · resellerclub · docker_engine · internal · manual |
| image_url | varchar(500) | NULLABLE | |
| badge_text | varchar(50) | NULLABLE | "Más popular", "Nuevo", etc. |
| order_index | integer | NOT NULL, DEFAULT 0 | |
| active | boolean | NOT NULL, DEFAULT true | |
| is_addon | boolean | NOT NULL, DEFAULT false | |
| is_global_addon | boolean | NOT NULL, DEFAULT false | Support Inside es global de cuenta |
| requires_existing_product | boolean | NOT NULL, DEFAULT false | |
| required_product_type | varchar(50) | NULLABLE | Qué tipo de producto debe tener el cliente |
| max_quantity_per_client | integer | NULLABLE | null = sin límite |
| grace_period_days | integer | NOT NULL, DEFAULT 0 | Días de gracia tras vencimiento |
| suspension_days | integer | NOT NULL, DEFAULT 7 | Días antes de suspender por impago |
| cancellation_days | integer | NOT NULL, DEFAULT 30 | Días hasta cancelar tras suspensión |
| data_retention_days | integer | NOT NULL, DEFAULT 30 | Retención de datos del servicio |
| client_can_pause | boolean | NOT NULL, DEFAULT false | |
| pause_max_days | integer | NULLABLE | |
| provisioner_config | jsonb | NULLABLE | Config del provisioner. Pendiente por plugin. |
| audit_event_types | jsonb | NULLABLE | Tipos de evento del audit log del servicio y sus campos |
| docker_template_id | uuid | NULLABLE, FK → docker_templates(id) | Solo para tipo docker_service |
| docker_custom_api_blocks | jsonb | NULLABLE | Bloques custom de API para métricas del cliente |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_products_slug` — UNIQUE en slug
- `idx_products_type` — en type
- `idx_products_active` — en active
- `idx_products_category` — en category_id

**Notas de decisión:**
- `audit_event_types` es jsonb con la definición de eventos y sus campos. Ej: `[{"type": "container_updated", "label": "Tu servicio fue actualizado", "fields": [{"key": "version_new", "label": "Nueva versión"}]}]`
- `docker_custom_api_blocks` define endpoints de API interna del contenedor para mostrar métricas al cliente.
- `provisioner_config` se define al desarrollar cada plugin. No se generaliza.

---

### `product_pricing`
Planes de precio por producto y ciclo de facturación.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| product_id | uuid | NOT NULL, FK → products(id) ON DELETE CASCADE | |
| billing_cycle | enum | NOT NULL | monthly · annual |
| price | decimal(10,2) | NOT NULL | |
| currency | varchar(3) | NOT NULL, DEFAULT 'EUR' | ISO 4217 |
| discount_percentage | decimal(5,2) | NULLABLE | Descuento por pagar anual |
| active | boolean | NOT NULL, DEFAULT true | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- UNIQUE(product_id, billing_cycle, currency)

---

### `product_extras`
Extras vinculados a un producto. Pueden ser obligatorios u opcionales.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| product_id | uuid | NOT NULL, FK → products(id) ON DELETE CASCADE | El producto al que pertenece el extra |
| extra_product_id | uuid | NULLABLE, FK → products(id) | El producto que se ofrece como extra |
| type | enum | NOT NULL | free_period · discount · included_product |
| is_mandatory | boolean | NOT NULL, DEFAULT false | Si true, siempre incluido. Si false, el cliente elige. |
| label | varchar(200) | NOT NULL | Descripción visible al cliente |
| discount_percentage | decimal(5,2) | NULLABLE | |
| free_months | integer | NULLABLE | |
| max_value_eur | decimal(10,2) | NULLABLE | Límite de valor para dominio regalo |
| applicable_cycles | enum | NOT NULL, DEFAULT 'annual' | monthly · annual · both |
| tld_restrictions | jsonb | NULLABLE | Para dominios regalo: qué TLDs aplican |
| valid_until | timestamptz | NULLABLE | |
| max_uses | integer | NULLABLE | null = sin límite |
| uses_count | integer | NOT NULL, DEFAULT 0 | |
| active | boolean | NOT NULL, DEFAULT true | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Notas de decisión:**
- El dominio regalo con hosting anual es un extra de tipo `free_period` con `is_mandatory = false`, `applicable_cycles = annual`, y `tld_restrictions` configurado.

---

### `product_checklist_items`
Checklist base de mantenimiento definido al crear el producto.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| product_id | uuid | NOT NULL, FK → products(id) ON DELETE CASCADE | |
| label | varchar(200) | NOT NULL | |
| order_index | integer | NOT NULL, DEFAULT 0 | |
| is_required | boolean | NOT NULL, DEFAULT true | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Notas de decisión:**
- Este checklist se hereda al crear tareas de mantenimiento para un servicio.
- Se puede personalizar por servicio concreto en `service_checklist_items`.

---

### `docker_templates`
Plantillas .yaml para provisioning de productos Docker.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| name | varchar(200) | NOT NULL | |
| slug | varchar(200) | NOT NULL, UQ | |
| yaml_content | text | NOT NULL | Contenido de la plantilla con variables como {{SUBDOMAIN}}, {{RAM_MB}} |
| variables | jsonb | NOT NULL | Lista de variables inyectables con descripción y si son obligatorias |
| version | varchar(20) | NOT NULL, DEFAULT '1.0.0' | |
| created_by | uuid | NOT NULL, FK → users(id) | Solo superadmin |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Notas de decisión:**
- Las plantillas viven en el dashboard, no en los servidores.
- Al provisionar, el sistema inyecta las variables y envía el docker-compose.yml generado al servidor.
- Solo el superadmin puede crear y editar plantillas.

---

### `support_inside_config`
Configuración específica de productos tipo Support Inside.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| product_id | uuid | NOT NULL, FK → products(id) ON DELETE CASCADE, UQ | |
| level_name | varchar(100) | NOT NULL | Básico, Medium, Pro — lo define el admin |
| has_real_agent_first | boolean | NOT NULL, DEFAULT false | |
| can_access_client_product | boolean | NOT NULL, DEFAULT false | |
| has_proactive_maintenance | boolean | NOT NULL, DEFAULT false | |
| available_channels | jsonb | NOT NULL | Array: ["webchat", "async", "email", "phone", "whatsapp"] |
| response_sla_minutes | integer | NULLABLE | Tiempo de respuesta garantizado |
| slots_included_free | integer | NOT NULL, DEFAULT 0 | |
| slot_type_available | enum | NOT NULL, DEFAULT 'maintenance' | maintenance · maintenance_and_management · both |
| slot_price_monthly | decimal(10,2) | NULLABLE | Precio por slot adicional mensual |
| slot_price_annual | decimal(10,2) | NULLABLE | Precio por slot adicional anual |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

---

## BLOQUE 4 — SERVICIOS Y PROVISIONING ⬜ Sprint 11 (Provisioning)

---

### `services`
Instancias de productos contratados por clientes. El corazón del sistema.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) | |
| product_id | uuid | NOT NULL, FK → products(id) | |
| billing_profile_id | uuid | NULLABLE, FK → billing_profiles(id) | Perfil de facturación para este servicio |
| server_id | uuid | NULLABLE, FK → servers(id) | Solo para productos Docker |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · provisioning · active · suspended · cancelled · failed · paused |
| provisioner_reference | varchar(500) | NULLABLE | ID externo en el sistema del provisioner (ej: ID en Enhance CP) |
| subdomain | varchar(255) | NULLABLE | |
| custom_domain | varchar(255) | NULLABLE | |
| ssl_expires_at | timestamptz | NULLABLE | |
| provisioned_at | timestamptz | NULLABLE | |
| suspended_at | timestamptz | NULLABLE | |
| cancelled_at | timestamptz | NULLABLE | |
| next_renewal_at | timestamptz | NULLABLE | Fecha de aniversario — renovación |
| paused_at | timestamptz | NULLABLE | |
| paused_until | timestamptz | NULLABLE | |
| cancellation_reason | text | NULLABLE | |
| failure_reason | text | NULLABLE | Motivo si status = failed |
| provisioner_data | jsonb | NULLABLE | Datos específicos del provisioner (credenciales, config, etc.) |
| resource_config | jsonb | NULLABLE | RAM, CPU, disco asignados. Para Docker. |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_services_user_id` — en user_id
- `idx_services_status` — en status
- `idx_services_next_renewal` — en next_renewal_at (para job de renovaciones)
- `idx_services_product_id` — en product_id

---

### `service_checklist_items`
Checklist personalizado por servicio. Hereda del producto pero puede modificarse.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| service_id | uuid | NOT NULL, FK → services(id) ON DELETE CASCADE | |
| label | varchar(200) | NOT NULL | |
| order_index | integer | NOT NULL, DEFAULT 0 | |
| is_required | boolean | NOT NULL, DEFAULT true | |
| source | enum | NOT NULL, DEFAULT 'product_default' | product_default · custom |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

---

### `subscriptions`
Suscripciones activas. Una por servicio.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) | |
| service_id | uuid | NOT NULL, FK → services(id), UQ | |
| product_pricing_id | uuid | NOT NULL, FK → product_pricing(id) | |
| billing_cycle | enum | NOT NULL | monthly · annual |
| current_period_start | timestamptz | NOT NULL | |
| current_period_end | timestamptz | NOT NULL | |
| status | enum | NOT NULL, DEFAULT 'active' | active · paused · cancelled · past_due |
| cancel_at_period_end | boolean | NOT NULL, DEFAULT false | |
| cancelled_at | timestamptz | NULLABLE | |
| payment_attempts | integer | NOT NULL, DEFAULT 0 | Intentos fallidos en el ciclo actual |
| last_payment_attempt_at | timestamptz | NULLABLE | |
| discount_code_id | uuid | NULLABLE, FK → discount_codes(id) | Código aplicado si hay |
| promotion_discount_amount | decimal(10,2) | NULLABLE | Descuento activo por promoción |
| promotion_discount_until | timestamptz | NULLABLE | Hasta cuándo aplica el descuento |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_subscriptions_status` — en status
- `idx_subscriptions_period_end` — en current_period_end (para job de renovaciones)

---

### `provisioning_log`
Registro inmutable de todos los intentos de provisioning.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| service_id | uuid | NOT NULL, FK → services(id) | |
| action | enum | NOT NULL | provision · suspend · reactivate · terminate |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · processing · completed · failed |
| attempt_number | integer | NOT NULL, DEFAULT 1 | |
| plugin_used | varchar(100) | NOT NULL | |
| request_payload | jsonb | NULLABLE | Qué se envió al provisioner |
| response_payload | jsonb | NULLABLE | Qué respondió |
| error_message | text | NULLABLE | |
| started_at | timestamptz | NOT NULL, DEFAULT now() | |
| completed_at | timestamptz | NULLABLE | |

**Notas de decisión:**
- Este log es de solo lectura para el admin. Nunca se edita.
- Cada job es idempotente. Si se reintenta, crea un nuevo registro con attempt_number incrementado.

---

### `billing_credits`
Créditos generados por prorrateo al cambiar de plan.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) | |
| service_id | uuid | NULLABLE, FK → services(id) | |
| amount | decimal(10,2) | NOT NULL | |
| currency | varchar(3) | NOT NULL, DEFAULT 'EUR' | |
| reason | text | NULLABLE | Descripción legible del prorrateo |
| applied_at | timestamptz | NULLABLE | null = pendiente de aplicar |
| applied_to_invoice_id | uuid | NULLABLE, FK → invoices(id) | En qué factura se aplicó |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Notas de decisión:**
- Los créditos nunca se devuelven como dinero. Se aplican como descuento en la próxima factura.
- El cálculo: precio diario del plan actual × días no consumidos.

---

## BLOQUE 5 — FACTURACIÓN ⬜ Sprint 6 (Billing)

---

### `invoices`
Facturas emitidas. Inmutables tras su emisión (rectificación via nueva factura).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) | |
| billing_profile_id | uuid | NULLABLE, FK → billing_profiles(id) | Perfil usado para esta factura |
| invoice_number | varchar(50) | NOT NULL, UQ | Formato configurable en settings. Ej: AELIUM-2026-0042 |
| type | enum | NOT NULL | full · simplified (simplified = sin NIF del receptor) |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · paid · failed · cancelled · refunded |
| subtotal | decimal(10,2) | NOT NULL | Base imponible |
| tax_rate | decimal(5,2) | NOT NULL, DEFAULT 21.00 | IVA |
| tax_amount | decimal(10,2) | NOT NULL | |
| total | decimal(10,2) | NOT NULL | |
| currency | varchar(3) | NOT NULL, DEFAULT 'EUR' | |
| due_date | timestamptz | NOT NULL | |
| paid_at | timestamptz | NULLABLE | |
| notes | text | NULLABLE | Notas internas o para el cliente |
| pdf_url | varchar(500) | NULLABLE | Generado async via BullMQ |
| is_manual | boolean | NOT NULL, DEFAULT false | Factura creada manualmente por el admin |
| credit_applied | decimal(10,2) | NOT NULL, DEFAULT 0 | Crédito de prorrateo aplicado |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_invoices_user_id` — en user_id
- `idx_invoices_status` — en status
- `idx_invoices_due_date` — en due_date (para job de vencimientos)
- `idx_invoices_number` — UNIQUE en invoice_number

**Notas de decisión:**
- Las facturas se conservan 10 años (obligación Hacienda España). No configurables.
- La numeración es secuencial por año. El formato es configurable en settings.

---

### `invoice_items`
Líneas de cada factura.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| invoice_id | uuid | NOT NULL, FK → invoices(id) ON DELETE CASCADE | |
| service_id | uuid | NULLABLE, FK → services(id) | |
| description | varchar(500) | NOT NULL | |
| quantity | integer | NOT NULL, DEFAULT 1 | |
| unit_price | decimal(10,2) | NOT NULL | |
| discount_amount | decimal(10,2) | NOT NULL, DEFAULT 0 | |
| subtotal | decimal(10,2) | NOT NULL | (quantity × unit_price) - discount_amount |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

---

### `payments`
Intentos de cobro y su resultado.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| invoice_id | uuid | NOT NULL, FK → invoices(id) | |
| plugin_used | varchar(100) | NOT NULL | stripe · redsys |
| external_transaction_id | varchar(500) | NULLABLE | ID en el sistema del proveedor de pagos |
| amount | decimal(10,2) | NOT NULL | |
| currency | varchar(3) | NOT NULL, DEFAULT 'EUR' | |
| status | enum | NOT NULL | pending · processing · succeeded · failed · refunded |
| attempt_number | integer | NOT NULL, DEFAULT 1 | |
| failure_reason | text | NULLABLE | |
| payment_method_type | varchar(100) | NULLABLE | card · sepa_debit |
| payment_method_last4 | varchar(4) | NULLABLE | Últimos 4 dígitos (nunca datos completos) |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_payments_invoice_id` — en invoice_id
- `idx_payments_status` — en status

---

## BLOQUE 6 — SUPPORT INSIDE Y TAREAS ⬜ Sprint 7-8 (Support + Tasks)

---

### `support_inside_subscriptions`
Suscripción activa de Support Inside de un cliente.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) | |
| service_id | uuid | NOT NULL, FK → services(id), UQ | El servicio de Support Inside contratado |
| status | enum | NOT NULL, DEFAULT 'active' | active · cancelled · suspended |
| activated_at | timestamptz | NOT NULL | |
| cancelled_at | timestamptz | NULLABLE | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Notas de decisión:**
- Al cancelar Support Inside → todos sus slots se cancelan automáticamente.
- Un slot se puede cancelar individualmente sin cancelar Support Inside.

---

### `support_inside_slots`
Slots de mantenimiento (y gestión) asignados a servicios del cliente.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| support_inside_subscription_id | uuid | NOT NULL, FK → support_inside_subscriptions(id) | |
| assigned_service_id | uuid | NOT NULL, FK → services(id) | La web/producto al que aplica el slot |
| slot_type | enum | NOT NULL | maintenance · maintenance_and_management |
| is_included_free | boolean | NOT NULL, DEFAULT false | Viene gratis con el plan o es de pago adicional |
| billing_cycle | enum | NULLABLE | monthly · annual |
| price | decimal(10,2) | NULLABLE | null si is_included_free = true |
| status | enum | NOT NULL, DEFAULT 'active' | active · cancelled |
| anniversary_day | integer | NOT NULL | Día del mes (1-28) para generar tarea de mantenimiento |
| activated_at | timestamptz | NOT NULL | |
| cancelled_at | timestamptz | NULLABLE | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_slots_subscription_id` — en support_inside_subscription_id
- `idx_slots_service_id` — en assigned_service_id
- `idx_slots_anniversary` — en anniversary_day (para job de generación de tareas mensuales)

**Notas de decisión:**
- `anniversary_day` máximo 28 para evitar problemas con febrero.
- El mantenimiento corresponde al mes en curso. No se arrastra si no se completa.

---

### `tasks`
Tareas del equipo. Generadas automáticamente o manualmente.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| type | enum | NOT NULL | wow_call · maintenance · maintenance_management · we_do_it_for_you · custom_work · support_setup |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · in_progress · completed · not_completed_in_time |
| priority | enum | NOT NULL, DEFAULT 'medium' | low · medium · high · critical |
| assigned_to | uuid | NULLABLE, FK → users(id) | Agente asignado |
| client_id | uuid | NOT NULL, FK → users(id) | |
| service_id | uuid | NULLABLE, FK → services(id) | |
| slot_id | uuid | NULLABLE, FK → support_inside_slots(id) | |
| title | varchar(300) | NOT NULL | |
| description | text | NULLABLE | |
| client_note | text | NULLABLE | Nota del cliente al contratar (para We Do It For You) |
| due_date | timestamptz | NULLABLE | |
| completed_at | timestamptz | NULLABLE | |
| is_recurring | boolean | NOT NULL, DEFAULT false | |
| recurrence_day | integer | NULLABLE | Día del mes para tareas recurrentes |
| billing_month | varchar(7) | NULLABLE | YYYY-MM — a qué mes corresponde el mantenimiento |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_tasks_assigned_to` — en assigned_to
- `idx_tasks_client_id` — en client_id
- `idx_tasks_status` — en status
- `idx_tasks_due_date` — en due_date
- `idx_tasks_billing_month` — en billing_month (para verificar mantenimientos del mes)

---

### `task_checklist_completions`
Estado de completitud de cada item del checklist en una tarea.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| task_id | uuid | NOT NULL, FK → tasks(id) ON DELETE CASCADE | |
| checklist_item_id | uuid | NOT NULL, FK → service_checklist_items(id) | |
| completed | boolean | NOT NULL, DEFAULT false | |
| completed_at | timestamptz | NULLABLE | |
| completed_by | uuid | NULLABLE, FK → users(id) | |

**Índices:**
- UNIQUE(task_id, checklist_item_id)

---

### `maintenance_logs`
Registro de mantenimientos completados. Se crea al completar una tarea de mantenimiento.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| task_id | uuid | NOT NULL, FK → tasks(id), UQ | |
| service_id | uuid | NOT NULL, FK → services(id) | |
| completed_by | uuid | NOT NULL, FK → users(id) | |
| client_notes | text | NULLABLE | Notas para el cliente. Se inyectan en la plantilla de email. |
| internal_notes | text | NULLABLE | Solo visibles para el equipo. |
| notified_channels | jsonb | NOT NULL, DEFAULT '[]' | Canales usados: ["email", "whatsapp"] |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

---

## BLOQUE 7 — COMUNICACIÓN Y SOPORTE ⬜ Sprint 7 (Support)

---

### `conversations`
Hilos de comunicación. Chat en tiempo real y conversaciones asíncronas.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NULLABLE, FK → users(id) | null si es anónimo |
| guest_name | varchar(200) | NULLABLE | Para anónimos en la landing |
| guest_email | varchar(255) | NULLABLE | Para vincular al registrarse |
| guest_session_token | varchar(500) | NULLABLE | Token para vincular conversación anónima |
| assigned_to | uuid | NULLABLE, FK → users(id) | Agente asignado |
| type | enum | NOT NULL | realtime_chat · async |
| status | enum | NOT NULL, DEFAULT 'active' | active · waiting_agent · waiting_client · resolved · closed |
| channel | enum | NOT NULL, DEFAULT 'webchat' | webchat · whatsapp · email |
| subject | varchar(300) | NULLABLE | Para conversaciones asíncronas |
| priority | enum | NOT NULL, DEFAULT 'medium' | low · medium · high · urgent |
| source | enum | NOT NULL | landing · dashboard · escalated_from_chat |
| parent_conversation_id | uuid | NULLABLE, FK → conversations(id) | Si viene de un chat escalado a async |
| has_support_inside | boolean | NOT NULL, DEFAULT false | Estado del cliente al crear la conversación |
| ai_handled | boolean | NOT NULL, DEFAULT false | Si la IA intentó resolver |
| ai_summary | text | NULLABLE | Resumen de lo que intentó la IA antes de escalar |
| closed_at | timestamptz | NULLABLE | |
| anonymized_at | timestamptz | NULLABLE | Cuando se anonimizan los datos (2 años) |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_conversations_user_id` — en user_id
- `idx_conversations_status` — en status
- `idx_conversations_assigned` — en assigned_to
- `idx_conversations_guest_email` — en guest_email (para vinculación al registrarse)
- `idx_conversations_created_at` — en created_at (para limpieza por retención)

**Notas de decisión:**
- Retención 2 años. Después: anonimización (no borrado). El hilo existe pero sin datos personales.
- La vinculación de chat anónimo ocurre al registrarse el usuario con el mismo email.

---

### `messages`
Mensajes dentro de una conversación.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| conversation_id | uuid | NOT NULL, FK → conversations(id) ON DELETE CASCADE | |
| sender_id | uuid | NULLABLE, FK → users(id) | null si es anónimo o sistema |
| sender_type | enum | NOT NULL | client · agent · system · ai |
| content | text | NOT NULL | |
| is_internal | boolean | NOT NULL, DEFAULT false | Notas internas del agente. No visibles al cliente. |
| read_at | timestamptz | NULLABLE | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_messages_conversation_id` — en conversation_id
- `idx_messages_created_at` — en created_at

---

## BLOQUE 8 — INFRAESTRUCTURA Y SERVIDORES ⬜ Sprint 10 (Infrastructure)

---

### `servers`
Servidores registrados en el sistema.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| name | varchar(200) | NOT NULL | Nombre interno para el equipo |
| provider | varchar(100) | NOT NULL | Hetzner · OVH · Contabo |
| location_country | varchar(2) | NOT NULL | ISO alpha-2 |
| location_city | varchar(100) | NOT NULL | |
| location_datacenter | varchar(200) | NULLABLE | |
| ip_address | inet | NOT NULL | |
| connection_method | enum | NOT NULL | docker_api · ssh |
| connection_port | integer | NOT NULL | |
| credentials_encrypted | text | NOT NULL | Credenciales encriptadas. Nunca en claro. |
| ram_total_mb | integer | NULLABLE | Detectado automáticamente al registrar |
| cpu_cores_total | integer | NULLABLE | Detectado automáticamente |
| disk_total_gb | decimal(10,2) | NULLABLE | Detectado automáticamente |
| status | enum | NOT NULL, DEFAULT 'active' | active · maintenance · inactive |
| last_health_check_at | timestamptz | NULLABLE | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Notas de decisión:**
- La capacidad total se detecta automáticamente al registrar. No se introduce manualmente.
- Los recursos usados se calculan sumando los resource_config de los servicios activos en ese servidor.

---

### `server_pools`
Relación entre servidores y productos. Define qué servidores pueden alojar qué productos.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| server_id | uuid | NOT NULL, FK → servers(id) ON DELETE CASCADE | |
| product_id | uuid | NOT NULL, FK → products(id) ON DELETE CASCADE | |
| is_exclusive | boolean | NOT NULL, DEFAULT false | Si true, el servidor no aparece en otros productos |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- UNIQUE(server_id, product_id)

**Notas de decisión:**
- La exclusividad se define al asignar el servidor a un producto, no al registrar el servidor.
- Si is_exclusive = true, el servidor no aparece disponible al crear otros productos.

---

### `server_metrics`
Métricas periódicas de cada servidor.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| server_id | uuid | NOT NULL, FK → servers(id) ON DELETE CASCADE | |
| ram_used_mb | integer | NOT NULL | |
| cpu_usage_percent | decimal(5,2) | NOT NULL | |
| disk_used_gb | decimal(10,2) | NOT NULL | |
| active_containers | integer | NOT NULL | |
| recorded_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_server_metrics_server_id` — en server_id
- `idx_server_metrics_recorded_at` — en recorded_at (para limpieza por retención)

**Notas de decisión:**
- Retención configurable en settings. Predeterminado: 30 días.
- Se registra periódicamente via job `poll-server-metrics`.

---

## BLOQUE 9 — PROMOCIONES Y DESCUENTOS ⬜ Sprint futuro

---

### `promotions`
Reglas de promoción. Upsell y crossell.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| name | varchar(200) | NOT NULL | Nombre interno para el admin |
| type | enum | NOT NULL | upsell · crossell |
| status | enum | NOT NULL, DEFAULT 'active' | active · inactive · expired |
| trigger_type | enum | NOT NULL | checkout · post_checkout · dashboard_event |
| trigger_event | varchar(100) | NULLABLE | Nombre del evento si trigger_type = dashboard_event |
| trigger_conditions | jsonb | NULLABLE | Condiciones adicionales del trigger |
| target_product_id | uuid | NULLABLE, FK → products(id) | Producto que se ofrece |
| incentive_type | enum | NULLABLE | none · discount_percentage · free_months |
| incentive_value | decimal(10,2) | NULLABLE | |
| incentive_duration_months | integer | NULLABLE | |
| incentive_max_value_eur | decimal(10,2) | NULLABLE | |
| max_uses | integer | NULLABLE | null = sin límite |
| uses_count | integer | NOT NULL, DEFAULT 0 | |
| max_views_before_hide | integer | NOT NULL, DEFAULT 3 | Por cliente. Configurable. |
| valid_until | timestamptz | NULLABLE | Se desactiva automáticamente al cumplirse |
| created_by | uuid | NOT NULL, FK → users(id) | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

---

### `promotion_conditions`
Condiciones que deben cumplirse para que una promoción aplique a un cliente.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| promotion_id | uuid | NOT NULL, FK → promotions(id) ON DELETE CASCADE | |
| condition_type | enum | NOT NULL | has_product · not_has_product · plan_is · cycle_is · client_age_days_min |
| condition_value | varchar(200) | NOT NULL | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Notas de decisión:**
- Múltiples condiciones por promoción. Todas deben cumplirse (AND lógico).

---

### `promotion_messages`
Mensajes de una promoción. Uno por ubicación.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| promotion_id | uuid | NOT NULL, FK → promotions(id) ON DELETE CASCADE | |
| location | enum | NOT NULL | checkout · post_checkout · notification · service_banner |
| title | varchar(300) | NOT NULL | Puede contener variables: {{client.name}} |
| body | text | NOT NULL | |
| cta_label | varchar(100) | NOT NULL, DEFAULT 'Ver oferta' | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- UNIQUE(promotion_id, location)

---

### `promotion_views`
Registro de visualizaciones de promociones por cliente.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| promotion_id | uuid | NOT NULL, FK → promotions(id) ON DELETE CASCADE | |
| user_id | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE | |
| views_count | integer | NOT NULL, DEFAULT 1 | Se incrementa en cada visualización |
| dismissed_at | timestamptz | NULLABLE | Cuando el cliente hace clic en "No mostrar más" |
| accepted_at | timestamptz | NULLABLE | Cuando el cliente acepta la oferta |
| last_viewed_at | timestamptz | NOT NULL, DEFAULT now() | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- UNIQUE(promotion_id, user_id)

---

### `discount_codes`
Códigos de descuento configurables.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| code | varchar(100) | NOT NULL, UQ | |
| type | enum | NOT NULL | percentage · fixed_amount |
| value | decimal(10,2) | NOT NULL | Porcentaje o importe fijo |
| applicable_product_ids | jsonb | NULLABLE | null = aplica a todos los productos |
| applicable_cycles | enum | NOT NULL, DEFAULT 'both' | monthly · annual · both |
| only_new_clients | boolean | NOT NULL, DEFAULT false | |
| max_uses_total | integer | NULLABLE | null = sin límite |
| max_uses_per_client | integer | NOT NULL, DEFAULT 1 | |
| uses_count | integer | NOT NULL, DEFAULT 0 | |
| valid_from | timestamptz | NOT NULL, DEFAULT now() | |
| valid_until | timestamptz | NULLABLE | |
| active | boolean | NOT NULL, DEFAULT true | |
| created_by | uuid | NOT NULL, FK → users(id) | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

---

### `discount_code_uses`
Registro de usos de códigos de descuento.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| discount_code_id | uuid | NOT NULL, FK → discount_codes(id) | |
| user_id | uuid | NOT NULL, FK → users(id) | |
| invoice_id | uuid | NULLABLE, FK → invoices(id) | |
| amount_saved | decimal(10,2) | NOT NULL | |
| used_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_discount_uses_code_user` — en (discount_code_id, user_id) para validar usos por cliente

---

## BLOQUE 10 — NOTIFICACIONES Y CONFIGURACIÓN ✅/⬜

> `settings` ✅ implementado (Sprint 0). `notifications` ✅ stub en Prisma. Plantillas y canales ⬜ Sprint 9.

---

### `notifications`
Notificaciones internas del sistema (la campana en el dashboard).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE | |
| type | enum | NOT NULL | client · agent · admin |
| title | varchar(300) | NOT NULL | |
| body | text | NULLABLE | |
| severity | enum | NOT NULL, DEFAULT 'info' | info · warning · error · critical |
| read_at | timestamptz | NULLABLE | null = no leída |
| action_url | varchar(500) | NULLABLE | Enlace al recurso relacionado |
| related_entity_type | varchar(100) | NULLABLE | invoice · service · task · conversation |
| related_entity_id | uuid | NULLABLE | |
| expires_at | timestamptz | NOT NULL | DEFAULT now() + 90 días. Configurable en settings. |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_notifications_user_id` — en user_id
- `idx_notifications_read` — en (user_id, read_at) para contar no leídas
- `idx_notifications_expires` — en expires_at (para job de limpieza)

**Notas de decisión:**
- Retención 90 días. Configurable en settings.
- Se muestran máximo 50 en el historial. El resto se carga paginado.

---

### `notification_templates`
Plantillas editables por evento y canal.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| event_name | varchar(100) | NOT NULL | invoice.paid · service.provisioned · maintenance.completed |
| channel | enum | NOT NULL | email · whatsapp · internal |
| subject | varchar(300) | NULLABLE | Solo para email |
| body | text | NOT NULL | Con variables: {{client.name}}, {{service.name}} |
| available_variables | jsonb | NOT NULL | Lista de variables disponibles para este evento |
| active | boolean | NOT NULL, DEFAULT true | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- UNIQUE(event_name, channel)

---

### `knowledge_base_articles`
Base de conocimiento interna para agentes IA y agentes humanos.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| title | varchar(300) | NOT NULL | |
| content | text | NOT NULL | |
| type | enum | NOT NULL | technical · policy · faq · product_note |
| product_id | uuid | NULLABLE, FK → products(id) | Artículo relacionado con un producto |
| active | boolean | NOT NULL, DEFAULT true | |
| created_by | uuid | NOT NULL, FK → users(id) | Solo superadmin |
| updated_by | uuid | NULLABLE, FK → users(id) | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

---

### `knowledge_base_tags`
Etiquetas para organizar artículos de la base de conocimiento.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| article_id | uuid | NOT NULL, FK → knowledge_base_articles(id) ON DELETE CASCADE | |
| tag | varchar(100) | NOT NULL | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- UNIQUE(article_id, tag)

---

### `settings`
Configuración global del sistema. Clave-valor tipado.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| key | varchar(200) | NOT NULL, UQ | Ej: billing.invoice_advance_days |
| value | jsonb | NOT NULL | El valor. El tipo lo determina el campo `type`. |
| group | varchar(100) | NOT NULL | billing · support · infrastructure · notifications · security · brand · rgpd |
| label | varchar(200) | NOT NULL | Etiqueta legible para el admin |
| description | text | NULLABLE | |
| type | enum | NOT NULL | string · integer · boolean · json · select |
| options | jsonb | NULLABLE | Para tipo select: array de opciones válidas |
| updated_by | uuid | NULLABLE, FK → users(id) | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Notas de decisión:**
- Toda la lógica de negocio configurable vive aquí. Nada hardcodeado.
- Los valores por defecto se insertan via seed al inicializar el sistema.

---

### `integrations_registry`
Catálogo de integraciones externas visible al cliente en el portal de transparencia.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| slug | varchar(100) | NOT NULL, UQ | stripe · resellerclub · enhance_cp · claude_api |
| name | varchar(200) | NOT NULL | Nombre visible al cliente |
| public_description | text | NOT NULL | Qué hace esta integración. Visible al cliente. |
| data_accessed | text | NOT NULL | Qué datos del cliente accede. Visible al cliente. |
| location_description | text | NOT NULL | Dónde están los datos. Visible al cliente. |
| privacy_policy_url | varchar(500) | NULLABLE | |
| is_essential | boolean | NOT NULL, DEFAULT false | Si true, no se puede desactivar |
| active | boolean | NOT NULL, DEFAULT true | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

---

### `error_log`
Registro de todos los errores del sistema.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| severity | enum | NOT NULL | low · medium · high · critical |
| module | varchar(100) | NOT NULL | Módulo que generó el error |
| error_code | varchar(100) | NULLABLE | Código de error interno |
| message | text | NOT NULL | |
| stack_trace | text | NULLABLE | |
| context | jsonb | NULLABLE | Datos adicionales del contexto |
| user_id | uuid | NULLABLE, FK → users(id) | Usuario relacionado si aplica |
| request_id | varchar(200) | NULLABLE | Para trazar el request HTTP |
| resolved_at | timestamptz | NULLABLE | |
| resolved_by | uuid | NULLABLE, FK → users(id) | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_error_log_severity` — en severity
- `idx_error_log_created_at` — en created_at
- `idx_error_log_module` — en module

**Notas de decisión:**
- Errores de severity `high` o `critical` generan notificación interna al superadmin inmediatamente.
- El superadmin puede marcar errores como resueltos desde el dashboard.

---

### `event_outbox`
Cola de eventos persistente. Outbox Pattern para garantizar entrega de eventos entre módulos.
Un worker lee esta tabla y despacha los eventos pendientes. Si el proceso muere, el evento se reintenta.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| event_name | varchar(100) | NOT NULL | invoice.paid · service.provisioned · etc. |
| payload | jsonb | NOT NULL | Datos del evento |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · processing · done · failed |
| retry_count | integer | NOT NULL, DEFAULT 0 | |
| max_retries | integer | NOT NULL, DEFAULT 5 | |
| error_message | text | NULLABLE | Último error si falló |
| correlation_id | uuid | NULLABLE | Para trazar el flujo completo del request |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| processed_at | timestamptz | NULLABLE | |

**Índices:**
- `idx_outbox_pending` — PARTIAL en status WHERE status = 'pending' (el worker solo busca pendientes)
- `idx_outbox_created` — en created_at (para limpieza de eventos procesados)

**Notas de decisión:**
- Los eventos con status `done` se limpian tras 7 días (configurable en settings).
- Los eventos con status `failed` que agotan `max_retries` generan notificación al superadmin.
- El worker hace polling cada 5 segundos. No usa LISTEN/NOTIFY para mantener simplicidad.
- Esta tabla NO vive en el schema audit — es operativa y mutable.

---

## BLOQUE 11 — SCHEMA AUDIT (solo INSERT) ✅/⬜

> `audit_access_log` y `audit_change_log` ✅ stubs en Prisma. Escritura completa ⬜ Sprint 9.

> ⚠️ Todas las tablas de este schema son de solo escritura.
> Ningún rol tiene permisos de UPDATE ni DELETE sobre ninguna tabla de este schema.
> Los campos de nombre y rol están desnormalizados intencionalmente — si el agente
> cambia de nombre o rol en el futuro, el historial histórico debe preservar
> lo que era en el momento del acceso.

---

### `audit.access_log`
Registro de quién accedió a la ficha de un cliente y cuándo.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| client_id | uuid | NOT NULL | Sin FK — el audit no depende del schema público |
| actor_id | uuid | NULLABLE | null = acción del sistema |
| actor_name | varchar(200) | NULLABLE | ⚠️ desnormalizado — nombre en el momento del acceso |
| actor_role | varchar(50) | NULLABLE | ⚠️ desnormalizado — rol en el momento del acceso |
| origin_type | enum | NOT NULL | direct · ticket · task · chat · system |
| origin_id | uuid | NULLABLE | ID del ticket/tarea/chat que originó el acceso |
| ip_address | inet | NULLABLE | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_audit_access_client` — en client_id
- `idx_audit_access_created` — en created_at (para limpieza por retención de 2 años)

---

### `audit.change_log`
Registro de cambios en datos del cliente. Valor anterior y nuevo.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| client_id | uuid | NOT NULL | |
| actor_id | uuid | NULLABLE | |
| actor_name | varchar(200) | NULLABLE | ⚠️ desnormalizado |
| actor_role | varchar(50) | NULLABLE | ⚠️ desnormalizado |
| entity_type | varchar(100) | NOT NULL | Tabla afectada: users · billing_profiles · services |
| entity_id | uuid | NOT NULL | ID del registro modificado |
| field_name | varchar(200) | NOT NULL | Campo modificado |
| old_value | text | NULLABLE | Valor anterior serializado |
| new_value | text | NULLABLE | Valor nuevo serializado |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_audit_change_client` — en client_id
- `idx_audit_change_created` — en created_at

---

### `audit.integration_log`
Registro de datos enviados a integraciones externas.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| client_id | uuid | NOT NULL | |
| integration_slug | varchar(100) | NOT NULL | stripe · resellerclub · enhance_cp · claude_api |
| data_categories | jsonb | NOT NULL | Categorías de datos enviados |
| action | varchar(200) | NOT NULL | Qué operación se realizó |
| consent_validated | boolean | NOT NULL | ¿Se validó el consentimiento antes de enviar? |
| consent_granted | boolean | NOT NULL | ¿El cliente había dado consentimiento? |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_audit_integration_client` — en client_id
- `idx_audit_integration_slug` — en integration_slug
- `idx_audit_integration_created` — en created_at

**Notas de decisión:**
- Este registro es automático e inmutable. El admin no puede modificarlo.
- El cliente lo ve en su portal de transparencia.

---

### `audit.service_log`
Registro de eventos por servicio concreto. Metadata flexible por tipo de producto.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK, DEFAULT gen_random_uuid() | |
| service_id | uuid | NOT NULL | |
| client_id | uuid | NOT NULL | |
| tipo_accion | varchar(100) | NOT NULL | Definido al crear el producto en el catálogo |
| actor_id | uuid | NULLABLE | null = sistema automático |
| actor_name | varchar(200) | NULLABLE | ⚠️ desnormalizado |
| actor_role | varchar(50) | NULLABLE | ⚠️ desnormalizado |
| actor_nota | text | NULLABLE | Nota opcional del agente al acceder |
| task_id | uuid | NULLABLE | Si el acceso viene de una tarea |
| metadata | jsonb | NOT NULL, DEFAULT '{}' | Campos específicos del tipo de producto |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_audit_service_service` — en service_id
- `idx_audit_service_client` — en client_id
- `idx_audit_service_created` — en created_at

**Notas de decisión:**
- El campo `metadata` es JSON flexible. Cada tipo de producto define sus campos al crearse.
- Añadir un producto nuevo no requiere alterar esta tabla.
- El cliente ve este log dentro de la gestión de cada servicio. El frontend renderiza los campos de `metadata` usando la definición en `products.audit_event_types`.

---

## RESUMEN DE RELACIONES PRINCIPALES

```
users
  ├── user_profiles (1:1)
  ├── user_roles (1:N)
  ├── billing_profiles (1:N)
  ├── client_consents (1:N)
  ├── services (1:N)
  ├── subscriptions (1:N)
  ├── invoices (1:N)
  ├── conversations (1:N)
  └── notifications (1:N)

products
  ├── product_pricing (1:N)
  ├── product_extras (1:N)
  ├── product_checklist_items (1:N)
  ├── support_inside_config (1:1)
  ├── docker_templates (N:1)
  └── server_pools (1:N)

services
  ├── subscriptions (1:1)
  ├── service_checklist_items (1:N)
  ├── support_inside_slots (1:N)
  ├── tasks (1:N)
  └── provisioning_log (1:N)

support_inside_subscriptions
  └── support_inside_slots (1:N)
      └── tasks (1:N)

conversations
  └── messages (1:N)

servers
  ├── server_pools (1:N)
  └── server_metrics (1:N)

promotions
  ├── promotion_conditions (1:N)
  ├── promotion_messages (1:N)
  └── promotion_views (1:N)
```

---

*El SQL y las migraciones se generan en Antigravity a partir de este documento.*
*Ante cualquier cambio en el schema, actualizar este documento primero.*
*Las migraciones son siempre aditivas — nunca se elimina una columna sin deprecarla primero.*

---

## BLOQUE 12 — MÓDULO PARTNER (estructura base para fase 2) ⬜ Sprint futuro

> Los campos nullable en tablas existentes se añaden desde el inicio.
> Las tablas nuevas se crean en fase 2 al construir el módulo partner.
> Añadir los campos nullable ahora garantiza que el schema no necesite
> rediseño cuando llegue la fase 2.

---

### Campos añadidos en tablas existentes

**`users`** — campo nuevo:
| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| partner_id | uuid | NULLABLE, FK → partners(id) | null = cliente directo de Aelium |

**`services`** — campo nuevo:
| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| partner_id | uuid | NULLABLE, FK → partners(id) | null = servicio de cliente directo |

**`invoices`** — campos nuevos:
| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| partner_id | uuid | NULLABLE, FK → partners(id) | null = factura de cliente directo |
| partner_label | varchar(200) | NULLABLE | "Partner: Agencia X" en la factura |

**`products`** — campo nuevo:
| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| partner_commission_pct | decimal(5,2) | NULLABLE | % de comisión para el partner. null = sin comisión |

**`roles`** — registros nuevos en el seed:
```
partner_pending → Registrado y email verificado · pendiente de aprobación
partner         → Aprobado · acceso completo al dashboard partner
```

---

### `partners`
Datos de cada agencia partner. Se crea al aprobar la solicitud.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id), UQ | El usuario propietario de la cuenta partner |
| agency_name | varchar(200) | NOT NULL | |
| cif | varchar(20) | NOT NULL | |
| website | varchar(500) | NULLABLE | |
| estimated_clients | integer | NULLABLE | Informativo. Del formulario de registro. |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · active · rejected · suspended |
| referral_code | varchar(100) | UNIQUE | Código único para el enlace de registro |
| referral_link | varchar(500) | NULLABLE | URL completa generada al aprobar |
| approved_by | uuid | NULLABLE, FK → users(id) | Admin que aprobó |
| approved_at | timestamptz | NULLABLE | |
| rejected_at | timestamptz | NULLABLE | |
| rejection_reason | text | NULLABLE | |
| payout_method | enum | NULLABLE | sepa · stripe_connect · both |
| payout_iban | varchar(50) | NULLABLE | Encriptado |
| payout_stripe_account_id | varchar(200) | NULLABLE | ID de cuenta Stripe Connect |
| payout_cycle | enum | NOT NULL, DEFAULT 'monthly' | monthly · (futuro: weekly) |
| notes_internal | text | NULLABLE | Notas del admin sobre el partner |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_partners_user_id` — UNIQUE en user_id
- `idx_partners_status` — en status
- `idx_partners_referral_code` — UNIQUE en referral_code

---

### `partner_commissions`
Comisión acumulada por cada factura pagada de un cliente del partner.
Se genera automáticamente cuando se cobra una factura de un cliente del partner.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| partner_id | uuid | NOT NULL, FK → partners(id) | |
| client_id | uuid | NOT NULL, FK → users(id) | Cliente final del partner |
| invoice_id | uuid | NOT NULL, FK → invoices(id) | Factura que generó la comisión |
| service_id | uuid | NULLABLE, FK → services(id) | |
| product_id | uuid | NOT NULL, FK → products(id) | |
| invoice_total | decimal(10,2) | NOT NULL | Total de la factura |
| commission_pct | decimal(5,2) | NOT NULL | ⚠️ desnormalizado — % en el momento del cobro |
| commission_amount | decimal(10,2) | NOT NULL | Importe exacto de la comisión |
| currency | varchar(3) | NOT NULL, DEFAULT 'EUR' | |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · included_in_payout · paid |
| payout_id | uuid | NULLABLE, FK → partner_payouts(id) | En qué liquidación se incluyó |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_partner_commissions_partner` — en partner_id
- `idx_partner_commissions_status` — en status
- `idx_partner_commissions_payout` — en payout_id

**Notas de decisión:**
- El `commission_pct` se desnormaliza intencionalmente. Si el margen del producto
  cambia en el futuro, el historial de comisiones anteriores debe preservar
  el porcentaje que aplicaba en el momento del cobro.

---

### `partner_payouts`
Liquidaciones realizadas al partner.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| partner_id | uuid | NOT NULL, FK → partners(id) | |
| period_start | timestamptz | NOT NULL | Inicio del período liquidado |
| period_end | timestamptz | NOT NULL | Fin del período liquidado |
| total_commissions | decimal(10,2) | NOT NULL | Suma de comisiones incluidas |
| currency | varchar(3) | NOT NULL, DEFAULT 'EUR' | |
| payout_method | enum | NOT NULL | sepa · stripe_connect |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · processing · completed · failed |
| external_transfer_id | varchar(500) | NULLABLE | ID en Stripe o referencia SEPA |
| failure_reason | text | NULLABLE | |
| processed_at | timestamptz | NULLABLE | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_partner_payouts_partner` — en partner_id
- `idx_partner_payouts_status` — en status
- `idx_partner_payouts_period` — en (partner_id, period_start, period_end)

---

### `partner_notifications`
Notificaciones unidireccionales del partner a sus clientes finales.
No son chats. No esperan respuesta. Son comunicados o avisos.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| partner_id | uuid | NOT NULL, FK → partners(id) | |
| client_id | uuid | NOT NULL, FK → users(id) | Cliente destinatario |
| title | varchar(300) | NOT NULL | |
| body | text | NOT NULL | |
| read_at | timestamptz | NULLABLE | Cuando el cliente la leyó |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_partner_notif_partner` — en partner_id
- `idx_partner_notif_client` — en client_id

**Notas de decisión:**
- El agente de Aelium también ve estas notificaciones en la ficha del cliente.
- El partner no puede eliminar notificaciones ya enviadas.
- No hay respuesta posible del cliente a estas notificaciones.

---

### Actualización del resumen de relaciones

```
partners
  ├── partner_commissions (1:N)
  ├── partner_payouts (1:N)
  └── partner_notifications (1:N)

users
  └── partner_id (nullable) → partners

services
  └── partner_id (nullable) → partners

invoices
  ├── partner_id (nullable) → partners
  └── partner_label (nullable) → texto de la factura
```

---

## BLOQUE 13 — SISTEMA DE REFERIDOS ⬜ Sprint futuro

> Solo para clientes normales. Los partners no tienen sistema de referidos.

---

### `referral_codes`
Enlace de referido único por cliente. Se genera al crear la cuenta.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) ON DELETE CASCADE, UQ | |
| code | varchar(100) | NOT NULL, UQ | Código único. Genera la URL: aelium.es/r/CODIGO |
| active | boolean | NOT NULL, DEFAULT true | El admin puede desactivarlo |
| total_referrals | integer | NOT NULL, DEFAULT 0 | ⚠️ desnormalizado · contador para mostrar rápido |
| total_credits_earned | decimal(10,2) | NOT NULL, DEFAULT 0 | ⚠️ desnormalizado · total histórico |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_referral_codes_user` — UNIQUE en user_id
- `idx_referral_codes_code` — UNIQUE en code

**Notas de decisión:**
- Se genera automáticamente al crear cualquier cuenta de cliente.
- No se genera para partners ni para agentes.
- El cliente lo ve en su perfil con su enlace personalizado.

---

### `referrals`
Historial de referidos. Un registro por cada persona que usó el enlace.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| referral_code_id | uuid | NOT NULL, FK → referral_codes(id) | |
| referrer_id | uuid | NOT NULL, FK → users(id) | Cliente que compartió el enlace |
| referred_id | uuid | NOT NULL, FK → users(id), UQ | Cliente que se registró con el enlace |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · active · inactive |
| first_purchase_at | timestamptz | NULLABLE | Cuando el referido hizo su primera compra |
| first_invoice_id | uuid | NULLABLE, FK → invoices(id) | Primera factura del referido |
| discount_applied_pct | decimal(5,2) | NULLABLE | ⚠️ desnormalizado · % aplicado en el primer pedido |
| discount_applied_amount | decimal(10,2) | NULLABLE | Importe exacto del descuento aplicado |
| last_credit_generated_at | timestamptz | NULLABLE | Último mes en que se generó crédito |
| deactivated_at | timestamptz | NULLABLE | Cuando el referido canceló todos sus servicios |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |
| updated_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_referrals_referrer` — en referrer_id
- `idx_referrals_referred` — UNIQUE en referred_id (un usuario solo puede ser referido una vez)
- `idx_referrals_status` — en status (para job mensual de créditos)

**Notas de decisión:**
- `status = pending` → el referido se registró pero no ha comprado aún.
- `status = active` → el referido tiene al menos un servicio activo. Se genera crédito mensual.
- `status = inactive` → el referido canceló todos sus servicios. Se detiene el crédito.
- El crédito acumulado existente no se pierde al pasar a inactive.

---

### `referral_credits`
Créditos mensuales generados por cada referido activo.
Un registro por mes por cada referido activo.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| id | uuid | PK | |
| referral_id | uuid | NOT NULL, FK → referrals(id) | |
| referrer_id | uuid | NOT NULL, FK → users(id) | |
| amount | decimal(10,2) | NOT NULL | Crédito generado este mes |
| currency | varchar(3) | NOT NULL, DEFAULT 'EUR' | |
| billing_month | varchar(7) | NOT NULL | YYYY-MM · mes al que corresponde |
| status | enum | NOT NULL, DEFAULT 'pending' | pending · applied · expired |
| applied_to_invoice_id | uuid | NULLABLE, FK → invoices(id) | En qué factura se aplicó |
| applied_at | timestamptz | NULLABLE | |
| created_at | timestamptz | NOT NULL, DEFAULT now() | |

**Índices:**
- `idx_referral_credits_referrer` — en referrer_id
- `idx_referral_credits_status` — en status
- `idx_referral_credits_month` — en billing_month
- UNIQUE(referral_id, billing_month) — un crédito por referido por mes

**Notas de decisión:**
- Se genera via job mensual que busca todos los referrals con status = active.
- El crédito se aplica automáticamente en la próxima factura del cliente que refiere.
- El importe del crédito mensual viene de settings: `referrals.monthly_credit_amount`.

---

### Cola de trabajos — añadido

```
COLA: referrals
  jobs: generate-monthly-credits · apply-referral-discount · check-referral-status
```

**`generate-monthly-credits`** — corre a fin de mes.
Busca todos los referrals con `status = active` y genera un `referral_credit` para cada uno.

**`apply-referral-discount`** — corre al generar una factura.
Detecta si el cliente tiene créditos pendientes y los aplica como descuento.

**`check-referral-status`** — corre diariamente.
Detecta referidos que han cancelado todos sus servicios y actualiza el status a `inactive`.

---

### Actualización del resumen de relaciones

```
users (cliente normal)
  └── referral_codes (1:1)
        └── referrals (1:N)
              └── referral_credits (1:N por mes)
```

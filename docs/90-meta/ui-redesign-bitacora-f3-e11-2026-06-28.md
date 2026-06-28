# Bitácora del rediseño UI — F3·E11 (registro fiscal) · sesión 2026-06-28

> Registro riguroso de la vertical **F3·E11**: enriquecer el registro de cliente
> para capturar la **identidad fiscal** al alta (Personal / Autónomo / Empresa),
> 1:1 con el mockup vivo `Registro.dc.html`. **Rama:** `redesign/f3-registro`
> (desde master). IVA real diferido (decisión Yasmin). Verde.

## 0. Resumen ejecutivo

El registro pasa de **4 campos** a capturar el perfil de facturación, **cableando
modelos que ya existían** (`ClientProfile` + `BillingProfile`, enum
`personal|autonomo|empresa`). Talla M, casi todo cableado. **Backward-compatible**:
los campos nuevos son opcionales (los consumidores/E2E que mandan 4 campos siguen
funcionando). Dos fases (A backend, B frontend), ambas verdes + verificación visual
Playwright de la `/register` real.

## 1. Phase A — backend (commit `d8cd42f`)

- **Migración** `User.terms_accepted_at` (nullable). Aplicada en dev.
- **`RegisterDto`** +`phone, account_type, company_name, nif_cif, address_line1,
  city, postal_code, country, terms_accepted`. Validación **condicional**
  (`@ValidateIf`): NIF/CIF + dirección fiscal obligatorios para autónomo/empresa;
  razón social para empresa. Todo opcional ⇒ backward-compatible.
- **`register()`** envuelve user + ClientProfile + (autónomo/empresa) BillingProfile
  en un **`$transaction`** (atomicidad, mejora sobre los creates secuenciales
  previos). **Doble destino de los datos fiscales:** `ClientProfile` (identidad +
  fuente del registrante de dominios, ADR-077 A12) y `BillingProfile` (lo que
  factura, `is_default`). **Personal NO crea BillingProfile** (no aporta dirección,
  requerida por el modelo) → coincide con la lógica del mockup. `terms_accepted_at`
  se marca al aceptar.
- **4 unit** (`auth-register.service.spec`): personal (sin BillingProfile) / empresa
  (ClientProfile company + BillingProfile) / autónomo / términos. Mock del
  `$transaction(cb)` con `tx` espía.
- **Verde:** typecheck + lint + suite completa **1385** (sin regresión). No toca
  `@Module` → sin boot smoke.

## 2. Phase B — frontend (reskin de `/register`)

- **`registerAction`** (`lib/auth-actions.ts`): lee los campos nuevos, valida
  condicional (espejo del backend) + términos, los pasa al backend. `fieldErrors`
  ampliado.
- **`RegisterForm.tsx`** reskineado 1:1 con `Registro.dc.html`: selector de **3
  tarjetas** (Personal/Autónomo/Empresa) con hint por tipo · campos **condicionales**
  (razón social [empresa], NIF/CIF [autónomo/empresa], país + dirección fiscal) ·
  **hint de IVA por país** (ES 21 · PT 23 · FR 20 · DE 19 · IT 22 · NL 21) ·
  checkbox de **términos**. `account_type`/`terms_accepted` viajan por hidden inputs;
  el resto por `name` (FormData → Server Action). Reutiliza `AuthLayout` (F1d) +
  `auth.module.css` + nuevo `register-fiscal.module.css` (tokens, R16).
- **Verde:** typecheck + lint:check + **48 tests** + `next build` (`/register`
  compila).

## 3. Verificación visual (empírica)

`/register` es **pública** → screenshot Playwright sobre `next start` (build de
prod, puerto aislado):
- **Personal** ✓: sin campos fiscales, solo el hint "Factura simplificada a tu
  nombre".
- **Empresa** ✓: aparecen razón social, CIF, país, dirección, ciudad; **IVA
  dinámico** ("IVA aplicable: 23% (Portugal)" al seleccionar Portugal). La lógica
  condicional conmuta 1:1 con el mockup.

## 3.1 Smoke backend EN VIVO (2026-06-28) — contra la BD real

Tras aplicar la migración (`prisma migrate status` → "up to date") y **reiniciar el
backend** (`:3001`, fresco con el cliente Prisma regenerado · `Nest application
successfully started` · 4/4 plugins), se ejercitó el endpoint público
`POST /auth/register`:
- **Empresa fiscal completa → HTTP 201** (`{ message, user_id }`). Prueba que el
  `$transaction` (user + ClientProfile fiscal + **BillingProfile**) commitea contra
  Postgres real — un fallo del BillingProfile haría rollback→500.
- **Empresa SIN `nif_cif` → HTTP 400**. Prueba que la validación condicional
  `@ValidateIf` rechaza datos fiscales incompletos.

Cierra el hueco de "ejecución de queries en vivo" que la unit (mockeada) no cubría.
_(Artefacto: queda un usuario de smoke `smoke-e11-…@aelium.test` en
`pending_verification` en la BD dev; inerte.)_

## 4. Estado y siguiente paso

- **E11 CÓDIGO-COMPLETO y verde** (back + front) en `redesign/f3-registro` → **PR
  #140**. **Smoke backend en vivo ✅** (§3.1).
- **Diferido (consciente):** **IVA real por país** — se captura el país y se muestra
  el hint, pero el cálculo sigue a 21% default; aplicar el IVA por país requiere una
  tabla `country_tax_rates` + cableado en el cálculo de facturas (vertical aparte).
- **Falta (Yasmin):** smoke **visual** del flujo completo en el navegador (registrar
  empresa en `/register` → verificar email en MailPit → comprobar el BillingProfile).
  El backend ya está reiniciado con el código E11.
- Resto de F3: Stripe E6 (cobro), SI gestionado E8, SLA E9, notificaciones E10,
  macros E12, IA E13. F4 reskin página a página.

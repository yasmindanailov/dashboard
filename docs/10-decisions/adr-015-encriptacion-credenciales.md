# ADR-015 — Encriptación de credenciales con AES-256-GCM

> **Status:** Active
> **Date:** 2026-04 (origen) · 2026-04-26 (migración a ADR)
> **Original:** DECISIONS.md §31 (parcial) + Regla R12
> **Domain:** auth, security, foundation

---

## Contexto

El sistema almacena credenciales sensibles que **no son passwords del usuario**:

- API keys de Stripe, ResellerClub, Enhance CP, Anthropic.
- Credenciales SSH de servidores donde corren contenedores Docker.
- Tokens OAuth de integraciones externas.
- Webhook secrets para validar firmas.

Estas credenciales **deben ser leíbles** por el sistema en runtime (a diferencia de passwords de usuario que se hashean y nunca se descifran). Pero a la vez **no deben ser visibles** si alguien tiene acceso de solo-lectura a la base de datos.

Sin cifrado: dump accidental de la BD = filtración inmediata de todas las APIs y servidores externos de Aelium.

---

## Opciones consideradas

1. **Cifrado a nivel de columna con clave en BD.**
   - Pros: cero gestión externa de claves.
   - Contras: si la BD se compromete, la clave también. Cero defensa adicional.

2. **HashiCorp Vault o AWS KMS / Secrets Manager.**
   - Pros: gestión profesional de claves, rotación automática, audit nativo.
   - Contras: dependencia de servicio externo + coste recurrente. Overkill para nuestra escala. Aelium quiere self-hosted.

3. **Cifrado a nivel de aplicación con clave en variable de entorno** (clave NO en BD, NO en código).
   - Pros: separación clara: la BD sin la env var no descifra nada. La env var sin la BD no sirve para nada. Atacante necesita ambos.
   - Contras: rotación de clave es manual. Si se pierde la env var, los datos cifrados son irrecuperables.

4. **(Elegida)** **AES-256-GCM con clave maestra en variable de entorno** (`ENCRYPTION_KEY`).
   - AES-256-GCM = standard moderno, autenticated encryption (detecta tampering).
   - 256-bit key = secure horizon largo.
   - Clave en env var, nunca en BD ni en código.

---

## Decisión

### Algoritmo: AES-256-GCM

- **256 bits** de clave (32 bytes hex = 64 chars hex).
- **GCM** (Galois/Counter Mode): cifrado **autenticated** — detecta si el ciphertext fue manipulado (tampering).
- **IV (initialization vector)** aleatorio único por cada cifrado, de 96 bits (12 bytes), almacenado junto al ciphertext.
- **Auth tag** de 128 bits (16 bytes) que GCM produce, almacenado junto al ciphertext.

### Estructura del valor cifrado en BD

```
formato: <iv_base64>:<auth_tag_base64>:<ciphertext_base64>
```

Tres componentes separados por `:`. Cada uno en base64. La función de descifrado los separa, valida y devuelve el plaintext o lanza error si la auth tag no coincide.

### Clave maestra

- Env var **`ENCRYPTION_KEY`** = 64 caracteres hexadecimales (256 bits).
- Generación: `openssl rand -hex 32`.
- **Nunca** se guarda en BD, código fuente, repositorios ni logs.
- En desarrollo: valor de placeholder en `.env.example` con clave dummy.
- En producción: gestionado por el sistema de secrets del hosting (env vars cifradas en GitHub Secrets, hosting provider, etc.).
- **Rotación:** manual. Si se rota:
  1. Re-cifrar todos los valores con la nueva clave en una migración offline.
  2. Mantener brevemente la clave antigua disponible como fallback durante la transición.
  3. Una vez migrados, la clave antigua se elimina.

### Qué se cifra

- Credenciales de proveedores externos en tablas de configuración (Stripe API keys cuando exista plugin, Enhance CP credentials, ResellerClub keys).
- SSH keys de servidores en `servers` table.
- Webhook secrets.
- Tokens OAuth de integraciones (futuras).

### Qué NO se cifra (queda en plaintext en BD)

- Datos personales del usuario (nombre, email, dirección): no son credenciales. Su protección es vía permisos CASL + audit log.
- Hashes de passwords (`User.password_hash`): ya son hashes irreversibles con bcrypt.
- IDs internos, metadata, timestamps.

> **Distinción clave:** cifrado vs hashing. Passwords de usuario se **hashean** (bcrypt) — irreversible. Credenciales del sistema se **cifran** (AES-256-GCM) — reversible con la clave.

---

## Consecuencias

- ✅ **Ganamos:**
  - Dump de BD sin la env var es inservible para acceder a APIs externas.
  - Auth tag detecta tampering (alguien modifica el ciphertext en BD).
  - Algoritmo estándar, sin invenciones.
- ⚠️ **Aceptamos:**
  - **Si se pierde `ENCRYPTION_KEY`, los datos cifrados son irrecuperables.** Backup de la clave (en sistema de password management de Aelium) es crítico.
  - Rotación manual. No tan simple como con KMS automatizado.
  - Si la app se compromete (RCE), el atacante tiene la env var → mismo daño que sin cifrado. Mitigación: defensa en profundidad (rate limit, audit log, R7 errores notificados).
- 🚪 **Cierra:**
  - **No claves en BD ni en código.**
  - **No algoritmos custom.** AES-256-GCM, no se inventa.

---

## Cuándo revisar

- Si Aelium escala a múltiples instancias con gestión de claves complejas: evaluar KMS / Vault.
- Si surge un breach que requiera rotación urgente de claves → activar plan de rotación documentado.
- Si NIST deprecia AES-GCM (improbable en 10+ años) o publica algoritmo post-cuántico estándar.

---

## Referencias

- **Módulos afectados:** todos los que almacenan credenciales (futuro: payment plugins, provisioning plugins, infrastructure).
- **Reglas relacionadas:** R12 (credenciales encriptadas).
- **ADRs relacionados:** ADR-009 (plugins almacenan credenciales), ADR-043 (infrastructure almacena SSH).
- **Implementación:** función helper en `backend/src/core/crypto/` (cuando se necesite — hoy aún no se almacenan credenciales que requieran cifrado).
- **Variable de entorno:** `ENCRYPTION_KEY` en `.env.example` y backend secrets.

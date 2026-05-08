-- Sprint 15C Fase 15C.C (2026-05-08) — Tabla `enhance_customers` (ADR-083 §2 decisión 7).
--
-- Mapping canónico Client Aelium ↔ Customer Org Enhance.
--
-- Decisión sobre la PK (ADR-083 §2 decisión 7): `user_id` como PK natural
-- (NO UUID extra). Misma doctrina que `plugin_installs.slug` PK natural
-- (ADR-080 §2). El user Aelium ES la identidad del customer Enhance — añadir
-- un UUID encima sería un identificador artificial que duplica la identidad
-- funcional ya garantizada por `users.id`.
--
-- Cardinalidad: una fila por cada cliente Aelium con al menos UN hosting
-- Enhance contratado. Lazy create (ADR-083 §2 decisión 8): se inserta al
-- primer hosting Enhance del cliente, NO en alta del User.
--
-- `enhance_owner_login_id` y `enhance_owner_member_id` se persisten para
-- optimizar el SSO 2-call OTP flow (ADR-083 §4 decisión 13). Sin ellos, cada
-- SSO requeriría 1 call extra: GET /orgs/{cust} → resolver ownerId → GET sso.
-- Persistirlos: 1 sola call al endpoint /sso.
--
-- FK con `ON DELETE CASCADE`: si se borra el User Aelium (RGPD eliminación
-- cuenta), se borra el mapping. La cuenta Enhance correspondiente NO se
-- borra automáticamente — eso lo gestiona un proceso de retention RGPD
-- separado (Sprint 12.5 Portal Transparencia) que decide si purgar la
-- cuenta en Enhance o conservarla por compliance.

CREATE TABLE "enhance_customers" (
    "user_id"                 UUID NOT NULL,
    "enhance_org_id"          UUID NOT NULL,
    "enhance_owner_login_id"  UUID NOT NULL,
    "enhance_owner_member_id" UUID NOT NULL,
    "created_at"              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enhance_customers_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "enhance_customers_enhance_org_id_key" UNIQUE ("enhance_org_id")
);

-- FK al usuario Aelium con CASCADE — al borrar User, se borra el mapping.
ALTER TABLE "enhance_customers"
    ADD CONSTRAINT "enhance_customers_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- Índice unique sobre `enhance_org_id` ya creado por la PK alternativa
-- (UNIQUE constraint above). Permite búsqueda inversa Enhance → User
-- al recibir eventos del reconcile cron.

-- Rediseño UI F3·E12 — Respuestas guardadas (macros de soporte).
-- Biblioteca de EQUIPO: set único compartido por el staff de soporte.
-- `created_by` es trazabilidad (FK SetNull preserva la macro si el autor
-- se da de baja), NO aislamiento.

-- CreateTable
CREATE TABLE "response_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(10000) NOT NULL,
    "category" VARCHAR(60),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "response_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "response_templates_category_idx" ON "response_templates"("category");

-- AddForeignKey
ALTER TABLE "response_templates" ADD CONSTRAINT "response_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

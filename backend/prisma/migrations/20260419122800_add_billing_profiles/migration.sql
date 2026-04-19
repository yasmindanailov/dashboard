-- CreateEnum
CREATE TYPE "BillingProfileType" AS ENUM ('personal', 'autonomo', 'empresa');

-- CreateTable
CREATE TABLE "billing_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "BillingProfileType" NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "company_name" VARCHAR(200),
    "nif_cif" VARCHAR(20),
    "address_line1" VARCHAR(255) NOT NULL,
    "address_line2" VARCHAR(255),
    "city" VARCHAR(100) NOT NULL,
    "postal_code" VARCHAR(20) NOT NULL,
    "country" VARCHAR(2) NOT NULL DEFAULT 'ES',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_profiles_user_id_idx" ON "billing_profiles"("user_id");

-- AddForeignKey
ALTER TABLE "billing_profiles" ADD CONSTRAINT "billing_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

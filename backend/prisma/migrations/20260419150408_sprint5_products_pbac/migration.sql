/*
  Warnings:

  - You are about to drop the column `billing_cycle` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `cost_price` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `provisioner_plugin` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `renewal_price` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `requires_product_id` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `setup_fee` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `sort_order` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `trial_days` on the `products` table. All the data in the column will be lost.
  - You are about to alter the column `name` on the `products` table. The data in that column could be lost. The data in that column will be cast from `VarChar(300)` to `VarChar(200)`.
  - You are about to alter the column `slug` on the `products` table. The data in that column could be lost. The data in that column will be cast from `VarChar(300)` to `VarChar(200)`.
  - Added the required column `type` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('hosting_web', 'domain', 'docker_service', 'support_addon', 'support_service', 'we_do_it', 'custom_service');

-- CreateEnum
CREATE TYPE "ExtraType" AS ENUM ('free_period', 'discount', 'included_product');

-- CreateEnum
CREATE TYPE "ExtraApplicableCycle" AS ENUM ('monthly', 'annual', 'both');

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_requires_product_id_fkey";

-- DropIndex
DROP INDEX "products_category_idx";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "billing_cycle",
DROP COLUMN "category",
DROP COLUMN "cost_price",
DROP COLUMN "currency",
DROP COLUMN "price",
DROP COLUMN "provisioner_plugin",
DROP COLUMN "renewal_price",
DROP COLUMN "requires_product_id",
DROP COLUMN "setup_fee",
DROP COLUMN "sort_order",
DROP COLUMN "trial_days",
ADD COLUMN     "audit_event_types" JSONB,
ADD COLUMN     "badge_text" VARCHAR(50),
ADD COLUMN     "cancellation_days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "category_id" UUID,
ADD COLUMN     "client_can_pause" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "data_retention_days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "grace_period_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "image_url" VARCHAR(500),
ADD COLUMN     "is_global_addon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_quantity_per_client" INTEGER,
ADD COLUMN     "order_index" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pause_max_days" INTEGER,
ADD COLUMN     "provisioner" VARCHAR(100) NOT NULL DEFAULT 'manual',
ADD COLUMN     "required_product_type" VARCHAR(50),
ADD COLUMN     "requires_existing_product" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspension_days" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "type" "ProductType" NOT NULL,
ALTER COLUMN "name" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "slug" SET DATA TYPE VARCHAR(200);

-- DropEnum
DROP TYPE "ProductCategory";

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "parent_id" UUID,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_pricing" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "billing_cycle" "BillingCycle" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "setup_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "discount_percentage" DECIMAL(5,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_extras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "extra_product_id" UUID,
    "type" "ExtraType" NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
    "label" VARCHAR(200) NOT NULL,
    "discount_percentage" DECIMAL(5,2),
    "free_months" INTEGER,
    "max_value_eur" DECIMAL(10,2),
    "applicable_cycles" "ExtraApplicableCycle" NOT NULL DEFAULT 'annual',
    "tld_restrictions" JSONB,
    "valid_until" TIMESTAMPTZ,
    "max_uses" INTEGER,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_checklist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_slug_key" ON "product_categories"("slug");

-- CreateIndex
CREATE INDEX "product_categories_parent_id_idx" ON "product_categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_pricing_product_id_billing_cycle_currency_key" ON "product_pricing"("product_id", "billing_cycle", "currency");

-- CreateIndex
CREATE INDEX "product_extras_product_id_idx" ON "product_extras"("product_id");

-- CreateIndex
CREATE INDEX "product_checklist_items_product_id_idx" ON "product_checklist_items"("product_id");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_type_idx" ON "products"("type");

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_pricing" ADD CONSTRAINT "product_pricing_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_extras" ADD CONSTRAINT "product_extras_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_checklist_items" ADD CONSTRAINT "product_checklist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

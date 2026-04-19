-- AlterTable
ALTER TABLE "invoice_items" ADD COLUMN     "discount_pct" DECIMAL(5,2),
ADD COLUMN     "setup_fee" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "billing_profile_id" UUID,
ADD COLUMN     "is_manual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "max_retries" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "next_retry_at" TIMESTAMPTZ,
ADD COLUMN     "payment_provider" VARCHAR(100),
ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "billing_profile_id" UUID,
ADD COLUMN     "pause_max_date" TIMESTAMPTZ,
ADD COLUMN     "paused_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "invoices_billing_profile_id_idx" ON "invoices"("billing_profile_id");

-- CreateIndex
CREATE INDEX "invoices_next_retry_at_idx" ON "invoices"("next_retry_at");

-- CreateIndex
CREATE INDEX "services_billing_profile_id_idx" ON "services"("billing_profile_id");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_billing_profile_id_fkey" FOREIGN KEY ("billing_profile_id") REFERENCES "billing_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_profile_id_fkey" FOREIGN KEY ("billing_profile_id") REFERENCES "billing_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

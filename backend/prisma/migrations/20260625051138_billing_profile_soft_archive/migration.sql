-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_billing_profile_id_fkey";

-- DropIndex
DROP INDEX "billing_profiles_user_id_idx";

-- AlterTable
ALTER TABLE "billing_profiles" ADD COLUMN     "archived_at" TIMESTAMPTZ,
ADD COLUMN     "is_archived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "billing_profiles_user_id_is_archived_idx" ON "billing_profiles"("user_id", "is_archived");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_profile_id_fkey" FOREIGN KEY ("billing_profile_id") REFERENCES "billing_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

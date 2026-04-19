-- Merge support_addon + support_service into support_inside
-- Per DECISIONS.md §7 and §27: Support Inside is always one product type

BEGIN;
CREATE TYPE "ProductType_new" AS ENUM ('hosting_web', 'domain', 'docker_service', 'support_inside', 'we_do_it', 'custom_service');
ALTER TABLE "products" ALTER COLUMN "type" TYPE "ProductType_new" USING ("type"::text::"ProductType_new");
ALTER TYPE "ProductType" RENAME TO "ProductType_old";
ALTER TYPE "ProductType_new" RENAME TO "ProductType";
DROP TYPE "public"."ProductType_old";
COMMIT;

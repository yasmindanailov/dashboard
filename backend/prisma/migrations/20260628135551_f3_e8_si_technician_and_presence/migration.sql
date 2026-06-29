-- AlterTable
ALTER TABLE "support_inside_subscriptions" ADD COLUMN     "assigned_technician_id" UUID;

-- CreateTable
CREATE TABLE "user_presence" (
    "user_id" UUID NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_presence_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "user_presence_last_seen_at_idx" ON "user_presence"("last_seen_at");

-- CreateIndex
CREATE INDEX "support_inside_subscriptions_assigned_technician_id_idx" ON "support_inside_subscriptions"("assigned_technician_id");

-- AddForeignKey
ALTER TABLE "support_inside_subscriptions" ADD CONSTRAINT "support_inside_subscriptions_assigned_technician_id_fkey" FOREIGN KEY ("assigned_technician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

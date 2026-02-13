/*
  Warnings:

  - The values [RRHH] on the enum `ChatThreadType` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[type,groupKey]` on the table `ChatThread` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ChatThreadType_new" AS ENUM ('GLOBAL', 'EMPRESA', 'GROUP', 'DM');
ALTER TABLE "ChatThread" ALTER COLUMN "type" TYPE "ChatThreadType_new" USING ("type"::text::"ChatThreadType_new");
ALTER TYPE "ChatThreadType" RENAME TO "ChatThreadType_old";
ALTER TYPE "ChatThreadType_new" RENAME TO "ChatThreadType";
DROP TYPE "public"."ChatThreadType_old";
COMMIT;

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_type_groupKey_key" ON "ChatThread"("type", "groupKey");

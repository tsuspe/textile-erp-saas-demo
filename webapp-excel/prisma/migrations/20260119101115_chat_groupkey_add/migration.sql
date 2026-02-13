-- AlterEnum
ALTER TYPE "ChatThreadType" ADD VALUE 'GROUP';

-- AlterTable
ALTER TABLE "ChatThread" ADD COLUMN     "groupKey" "GroupKey";

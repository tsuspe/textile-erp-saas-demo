-- AlterTable
ALTER TABLE "TimeDay" ADD COLUMN     "vacationRequestId" INTEGER;

-- AddForeignKey
ALTER TABLE "TimeDay" ADD CONSTRAINT "TimeDay_vacationRequestId_fkey" FOREIGN KEY ("vacationRequestId") REFERENCES "TimeVacationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

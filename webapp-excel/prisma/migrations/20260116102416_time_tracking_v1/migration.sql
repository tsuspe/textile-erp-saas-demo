-- CreateEnum
CREATE TYPE "TimeDayType" AS ENUM ('WORK', 'WEEKEND', 'HOLIDAY', 'VACATION', 'ABSENCE');

-- CreateEnum
CREATE TYPE "TimeSignMethod" AS ENUM ('PASSWORD');

-- CreateTable
CREATE TABLE "TimeHoliday" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeDay" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "morningIn" TEXT,
    "morningOut" TEXT,
    "afternoonIn" TEXT,
    "afternoonOut" TEXT,
    "note" TEXT,
    "type" "TimeDayType" NOT NULL DEFAULT 'WORK',
    "signedAt" TIMESTAMP(3),
    "signedById" TEXT,
    "signMethod" "TimeSignMethod",
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeHoliday_date_idx" ON "TimeHoliday"("date");

-- CreateIndex
CREATE INDEX "TimeHoliday_empresaId_idx" ON "TimeHoliday"("empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "TimeHoliday_empresaId_date_key" ON "TimeHoliday"("empresaId", "date");

-- CreateIndex
CREATE INDEX "TimeDay_empresaId_date_idx" ON "TimeDay"("empresaId", "date");

-- CreateIndex
CREATE INDEX "TimeDay_userId_date_idx" ON "TimeDay"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TimeDay_userId_empresaId_date_key" ON "TimeDay"("userId", "empresaId", "date");

-- AddForeignKey
ALTER TABLE "TimeHoliday" ADD CONSTRAINT "TimeHoliday_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeDay" ADD CONSTRAINT "TimeDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeDay" ADD CONSTRAINT "TimeDay_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeDay" ADD CONSTRAINT "TimeDay_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

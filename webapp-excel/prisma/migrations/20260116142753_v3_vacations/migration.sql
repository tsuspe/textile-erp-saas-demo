-- CreateEnum
CREATE TYPE "TimeVacationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TimeVacationBalance" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "carryoverDays" INTEGER NOT NULL DEFAULT 0,
    "entitledDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeVacationBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeVacationRequest" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "TimeVacationStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeVacationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeVacationBalance_empresaId_year_idx" ON "TimeVacationBalance"("empresaId", "year");

-- CreateIndex
CREATE INDEX "TimeVacationBalance_userId_year_idx" ON "TimeVacationBalance"("userId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "TimeVacationBalance_empresaId_userId_year_key" ON "TimeVacationBalance"("empresaId", "userId", "year");

-- CreateIndex
CREATE INDEX "TimeVacationRequest_empresaId_userId_status_idx" ON "TimeVacationRequest"("empresaId", "userId", "status");

-- CreateIndex
CREATE INDEX "TimeVacationRequest_empresaId_from_to_idx" ON "TimeVacationRequest"("empresaId", "from", "to");

-- CreateIndex
CREATE INDEX "TimeVacationRequest_userId_from_to_idx" ON "TimeVacationRequest"("userId", "from", "to");

-- AddForeignKey
ALTER TABLE "TimeVacationBalance" ADD CONSTRAINT "TimeVacationBalance_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeVacationBalance" ADD CONSTRAINT "TimeVacationBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeVacationRequest" ADD CONSTRAINT "TimeVacationRequest_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeVacationRequest" ADD CONSTRAINT "TimeVacationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeVacationRequest" ADD CONSTRAINT "TimeVacationRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "TimeCompanyVacation" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "from" TIMESTAMP(3) NOT NULL,
    "to" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeCompanyVacation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeCompanyVacation_empresaId_from_to_idx" ON "TimeCompanyVacation"("empresaId", "from", "to");

-- AddForeignKey
ALTER TABLE "TimeCompanyVacation" ADD CONSTRAINT "TimeCompanyVacation_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

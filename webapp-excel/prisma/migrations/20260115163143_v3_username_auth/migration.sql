-- 1) Añadir columnas nuevas como NULLABLE primero
ALTER TABLE "User"
ADD COLUMN "username" TEXT,
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- 2) Backfill del username para filas existentes
--    Como solo tienes 1 usuario ahora mismo, lo fijamos a 'aitor'
UPDATE "User"
SET "username" = 'aitor'
WHERE "username" IS NULL;

-- 3) Asegurar que no queda null
ALTER TABLE "User"
ALTER COLUMN "username" SET NOT NULL;

-- 4) Índices únicos
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
-- email sigue siendo unique, pero ahora nullable: Prisma se encarga o lo dejamos si ya existe.

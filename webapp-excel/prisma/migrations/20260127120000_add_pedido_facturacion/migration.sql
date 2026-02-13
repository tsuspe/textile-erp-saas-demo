-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "facturado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Pedido" ADD COLUMN     "numeroFactura" TEXT;
ALTER TABLE "Pedido" ADD COLUMN     "fechaFactura" TIMESTAMP(3);

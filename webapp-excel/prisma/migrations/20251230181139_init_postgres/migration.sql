-- CreateEnum
CREATE TYPE "EstadoEscandallo" AS ENUM ('ESCANDALLO', 'PRODUCCION');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Temporada" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Temporada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subfamilia" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subfamilia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Articulo" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "temporadaId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "subfamiliaId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Articulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escandallo" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "temporadaId" INTEGER NOT NULL,
    "articuloId" INTEGER,
    "modeloInterno" TEXT,
    "modeloCliente" TEXT,
    "patron" TEXT,
    "talla" TEXT,
    "patronista" TEXT,
    "fecha" TIMESTAMP(3),
    "imagenUrl" TEXT,
    "totalCoste" DOUBLE PRECISION,
    "porcentajeExtra" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "estado" "EstadoEscandallo" NOT NULL DEFAULT 'ESCANDALLO',
    "fechaAprobacion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escandallo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscandalloTejido" (
    "id" SERIAL NOT NULL,
    "escandalloId" INTEGER NOT NULL,
    "proveedor" TEXT,
    "serie" TEXT,
    "color" TEXT,
    "anchoReal" DOUBLE PRECISION,
    "anchoUtil" DOUBLE PRECISION,
    "consumoMuestra" TEXT,
    "consumoProduccion" DOUBLE PRECISION,
    "precio" DOUBLE PRECISION,
    "coste" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscandalloTejido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscandalloForro" (
    "id" SERIAL NOT NULL,
    "escandalloId" INTEGER NOT NULL,
    "proveedor" TEXT,
    "serie" TEXT,
    "color" TEXT,
    "anchoReal" DOUBLE PRECISION,
    "anchoUtil" DOUBLE PRECISION,
    "consumoMuestra" TEXT,
    "consumoProduccion" DOUBLE PRECISION,
    "precio" DOUBLE PRECISION,
    "coste" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscandalloForro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscandalloAccesorio" (
    "id" SERIAL NOT NULL,
    "escandalloId" INTEGER NOT NULL,
    "nombre" TEXT,
    "proveedor" TEXT,
    "referencia" TEXT,
    "color" TEXT,
    "medida" TEXT,
    "unidad" TEXT,
    "cantidad" DOUBLE PRECISION,
    "precioUnidad" DOUBLE PRECISION,
    "coste" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscandalloAccesorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscandalloGasto" (
    "id" SERIAL NOT NULL,
    "escandalloId" INTEGER NOT NULL,
    "tipo" TEXT,
    "descripcion" TEXT,
    "importe" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EscandalloGasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "escandalloId" INTEGER NOT NULL,
    "numeroPedido" TEXT,
    "fechaPedido" TIMESTAMP(3),
    "fechaEntrega" TIMESTAMP(3),
    "modeloInterno" TEXT,
    "modeloCliente" TEXT,
    "patron" TEXT,
    "descripcionPedido" TEXT,
    "costeEscandallo" DOUBLE PRECISION,
    "precioVenta" DOUBLE PRECISION,
    "pvp" DOUBLE PRECISION,
    "imagenUrl" TEXT,
    "tallerCorte" TEXT,
    "fechaCorte" TIMESTAMP(3),
    "albaranCorte" TEXT,
    "precioCorte" DOUBLE PRECISION,
    "tallerConfeccion" TEXT,
    "fechaConfeccion" TIMESTAMP(3),
    "albaranConfeccion" TEXT,
    "precioConfeccion" DOUBLE PRECISION,
    "preparacionAlmacen" JSONB,
    "controlCalidad" JSONB,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoTejido" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "proveedor" TEXT,
    "serie" TEXT,
    "color" TEXT,
    "consumoProduccion" DOUBLE PRECISION,
    "composicion" TEXT,
    "metrosPedidos" DOUBLE PRECISION,
    "fechaPedido" TIMESTAMP(3),
    "metrosRecibidos" DOUBLE PRECISION,
    "fechaMetrosRecibidos" TIMESTAMP(3),
    "consumoCorte" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoTejido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoForro" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "proveedor" TEXT,
    "serie" TEXT,
    "color" TEXT,
    "consumoProduccion" DOUBLE PRECISION,
    "composicion" TEXT,
    "metrosPedidos" DOUBLE PRECISION,
    "fechaPedido" TIMESTAMP(3),
    "metrosRecibidos" DOUBLE PRECISION,
    "fechaMetrosRecibidos" TIMESTAMP(3),
    "consumoCorte" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoForro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoAccesorio" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "nombre" TEXT,
    "proveedor" TEXT,
    "referencia" TEXT,
    "color" TEXT,
    "medida" TEXT,
    "unidad" TEXT,
    "consumoEsc" DOUBLE PRECISION,
    "cantidadPed" DOUBLE PRECISION,
    "fechaPedido" TIMESTAMP(3),
    "unidadesRecibidas" DOUBLE PRECISION,
    "fechaRecibidas" TIMESTAMP(3),
    "albaranAccesorio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoAccesorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoColor" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "tipoTalla" TEXT NOT NULL,
    "distribucion" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoComentario" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "tipo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoComentario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIInteraction" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "userId" INTEGER,
    "pathname" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "toolUsed" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "actionClicked" TEXT,
    "actionHref" TEXT,
    "actionPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_slug_key" ON "Empresa"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Temporada_codigo_key" ON "Temporada"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_empresaId_codigo_key" ON "Cliente"("empresaId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Subfamilia_codigo_key" ON "Subfamilia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Articulo_empresaId_codigo_key" ON "Articulo"("empresaId", "codigo");

-- CreateIndex
CREATE INDEX "Escandallo_empresaId_clienteId_temporadaId_idx" ON "Escandallo"("empresaId", "clienteId", "temporadaId");

-- CreateIndex
CREATE INDEX "Escandallo_empresaId_articuloId_idx" ON "Escandallo"("empresaId", "articuloId");

-- CreateIndex
CREATE INDEX "Pedido_empresaId_escandalloId_idx" ON "Pedido"("empresaId", "escandalloId");

-- CreateIndex
CREATE INDEX "AIInteraction_empresaId_createdAt_idx" ON "AIInteraction"("empresaId", "createdAt");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Articulo" ADD CONSTRAINT "Articulo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Articulo" ADD CONSTRAINT "Articulo_temporadaId_fkey" FOREIGN KEY ("temporadaId") REFERENCES "Temporada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Articulo" ADD CONSTRAINT "Articulo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Articulo" ADD CONSTRAINT "Articulo_subfamiliaId_fkey" FOREIGN KEY ("subfamiliaId") REFERENCES "Subfamilia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escandallo" ADD CONSTRAINT "Escandallo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escandallo" ADD CONSTRAINT "Escandallo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escandallo" ADD CONSTRAINT "Escandallo_temporadaId_fkey" FOREIGN KEY ("temporadaId") REFERENCES "Temporada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escandallo" ADD CONSTRAINT "Escandallo_articuloId_fkey" FOREIGN KEY ("articuloId") REFERENCES "Articulo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscandalloTejido" ADD CONSTRAINT "EscandalloTejido_escandalloId_fkey" FOREIGN KEY ("escandalloId") REFERENCES "Escandallo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscandalloForro" ADD CONSTRAINT "EscandalloForro_escandalloId_fkey" FOREIGN KEY ("escandalloId") REFERENCES "Escandallo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscandalloAccesorio" ADD CONSTRAINT "EscandalloAccesorio_escandalloId_fkey" FOREIGN KEY ("escandalloId") REFERENCES "Escandallo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscandalloGasto" ADD CONSTRAINT "EscandalloGasto_escandalloId_fkey" FOREIGN KEY ("escandalloId") REFERENCES "Escandallo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_escandalloId_fkey" FOREIGN KEY ("escandalloId") REFERENCES "Escandallo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoTejido" ADD CONSTRAINT "PedidoTejido_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoForro" ADD CONSTRAINT "PedidoForro_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoAccesorio" ADD CONSTRAINT "PedidoAccesorio_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoColor" ADD CONSTRAINT "PedidoColor_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoComentario" ADD CONSTRAINT "PedidoComentario_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

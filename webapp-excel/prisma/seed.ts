import {
  ChatMessageType,
  ChatThreadType,
  EstadoEscandallo,
  GroupKey,
  NotificationType,
  PrismaClient,
  TimeDayType,
  TimeVacationStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_MODE = (process.env.DEMO_MODE ?? "true").toLowerCase() === "true";
const DEMO_PASSWORD = process.env.DEMO_DEFAULT_PASSWORD ?? "demo1234";

type DemoUser = {
  username: string;
  email: string;
  name: string;
  groups: GroupKey[];
  empresas: string[];
};

const DEMO_USERS: DemoUser[] = [
  {
    username: "demo_admin",
    email: "admin.demo@example.com",
    name: "Administrador Demo",
    groups: [GroupKey.ADMIN, GroupKey.RRHH, GroupKey.ALMACEN, GroupKey.PRODUCCION],
    empresas: ["acme-demo", "northwind-demo"],
  },
  {
    username: "demo_rrhh",
    email: "rrhh.demo@example.com",
    name: "RRHH Demo",
    groups: [GroupKey.RRHH],
    empresas: ["acme-demo", "northwind-demo"],
  },
  {
    username: "demo_almacen",
    email: "almacen.demo@example.com",
    name: "Almacen Demo",
    groups: [GroupKey.ALMACEN],
    empresas: ["acme-demo", "northwind-demo"],
  },
];

const DEMO_EMPRESAS = [
  {
    slug: "acme-demo",
    nombre: "ACME Textiles",
    cif: "A00000001",
    centroTrabajo: "Centro Demo Madrid",
    ccc: "01112222333344445555",
    lugarFirma: "Madrid",
    textoLegal: "Documento generado en entorno demo sin validez laboral.",
  },
  {
    slug: "northwind-demo",
    nombre: "Northwind Apparel",
    cif: "A00000002",
    centroTrabajo: "Centro Demo Barcelona",
    ccc: "02223333444455556666",
    lugarFirma: "Barcelona",
    textoLegal: "Documento generado en entorno demo sin validez laboral.",
  },
] as const;

const TEMPORADAS = [
  { codigo: "24", descripcion: "Primavera-Verano 2024" },
  { codigo: "25", descripcion: "Otono-Invierno 2024/2025" },
  { codigo: "26", descripcion: "Primavera-Verano 2025" },
  { codigo: "27", descripcion: "Otono-Invierno 2025/2026" },
];

const SUBFAMILIAS = [
  { codigo: "BL", descripcion: "Blusas" },
  { codigo: "CH", descripcion: "Chaquetas" },
  { codigo: "PA", descripcion: "Pantalones" },
  { codigo: "VE", descripcion: "Vestidos" },
];

function asDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

async function ensureGroups() {
  const out = new Map<GroupKey, { id: string; key: GroupKey }>();
  const entries: Array<{ key: GroupKey; name: string }> = [
    { key: GroupKey.ADMIN, name: "Administracion" },
    { key: GroupKey.RRHH, name: "RRHH" },
    { key: GroupKey.ALMACEN, name: "Almacen" },
    { key: GroupKey.PRODUCCION, name: "Produccion" },
    { key: GroupKey.PATRONAJE, name: "Patronaje" },
    { key: GroupKey.CONTABILIDAD, name: "Contabilidad" },
  ];

  for (const g of entries) {
    const row = await prisma.group.upsert({
      where: { key: g.key },
      update: { name: g.name },
      create: { key: g.key, name: g.name },
      select: { id: true, key: true },
    });
    out.set(g.key, row);
  }

  return out;
}

async function ensureEmpresas() {
  const out = new Map<string, { id: number; slug: string; nombre: string }>();

  for (const e of DEMO_EMPRESAS) {
    const row = await prisma.empresa.upsert({
      where: { slug: e.slug },
      update: {
        nombre: e.nombre,
        cif: e.cif,
        centroTrabajo: e.centroTrabajo,
        ccc: e.ccc,
        lugarFirma: e.lugarFirma,
        textoLegal: e.textoLegal,
      },
      create: {
        slug: e.slug,
        nombre: e.nombre,
        cif: e.cif,
        centroTrabajo: e.centroTrabajo,
        ccc: e.ccc,
        lugarFirma: e.lugarFirma,
        textoLegal: e.textoLegal,
      },
      select: { id: true, slug: true, nombre: true },
    });
    out.set(e.slug, row);
  }

  // opcional legacy en modo demo
  await prisma.empresa.upsert({
    where: { slug: "legacy" },
    update: { nombre: "Legacy Demo" },
    create: { slug: "legacy", nombre: "Legacy Demo" },
  });

  return out;
}

async function ensureTemporadas() {
  const out = new Map<string, { id: number; codigo: string }>();
  for (const t of TEMPORADAS) {
    const row = await prisma.temporada.upsert({
      where: { codigo: t.codigo },
      update: { descripcion: t.descripcion },
      create: t,
      select: { id: true, codigo: true },
    });
    out.set(t.codigo, row);
  }
  return out;
}

async function ensureSubfamilias() {
  const out = new Map<string, { id: number; codigo: string }>();
  for (const s of SUBFAMILIAS) {
    const row = await prisma.subfamilia.upsert({
      where: { codigo: s.codigo },
      update: { descripcion: s.descripcion },
      create: s,
      select: { id: true, codigo: true },
    });
    out.set(s.codigo, row);
  }
  return out;
}

async function ensureUsers(groupMap: Map<GroupKey, { id: string; key: GroupKey }>, empresaMap: Map<string, { id: number }>) {
  const password = await bcrypt.hash(DEMO_PASSWORD, 12);
  const users = new Map<string, { id: string; username: string; name: string }>();

  for (const u of DEMO_USERS) {
    const row = await prisma.user.upsert({
      where: { username: u.username },
      update: {
        name: u.name,
        email: u.email,
        isActive: true,
        mustChangePassword: false,
        password,
      },
      create: {
        username: u.username,
        email: u.email,
        name: u.name,
        password,
        isActive: true,
        mustChangePassword: false,
      },
      select: { id: true, username: true, name: true },
    });

    users.set(u.username, row);

    for (const g of u.groups) {
      const group = groupMap.get(g);
      if (!group) continue;
      await prisma.userGroup.upsert({
        where: { userId_groupId: { userId: row.id, groupId: group.id } },
        update: {},
        create: { userId: row.id, groupId: group.id },
      });
    }

    for (const empresaSlug of u.empresas) {
      const empresa = empresaMap.get(empresaSlug);
      if (!empresa) continue;
      await prisma.userEmpresa.upsert({
        where: { userId_empresaId: { userId: row.id, empresaId: empresa.id } },
        update: {},
        create: { userId: row.id, empresaId: empresa.id },
      });
    }
  }

  return users;
}

async function ensureMaestros(
  empresaMap: Map<string, { id: number }>,
  temporadaMap: Map<string, { id: number }>,
  subfamiliaMap: Map<string, { id: number }>,
) {
  const outClientes = new Map<string, { id: number; empresaId: number }>();
  const outArticulos = new Map<string, { id: number; empresaId: number }>();

  const defs = [
    {
      empresa: "acme-demo",
      clientes: [
        { codigo: "C01", nombre: "Cliente Demo 01" },
        { codigo: "C02", nombre: "Cliente Demo 02" },
        { codigo: "C03", nombre: "Cliente Demo 03" },
      ],
      articulos: [
        {
          codigo: "ACM-BL-1001",
          descripcion: "Blusa demo manga larga",
          clienteCodigo: "C01",
          temporadaCodigo: "26",
          subfamiliaCodigo: "BL",
        },
        {
          codigo: "ACM-CH-2002",
          descripcion: "Chaqueta demo entallada",
          clienteCodigo: "C02",
          temporadaCodigo: "27",
          subfamiliaCodigo: "CH",
        },
      ],
    },
    {
      empresa: "northwind-demo",
      clientes: [
        { codigo: "N01", nombre: "Cliente Demo 11" },
        { codigo: "N02", nombre: "Cliente Demo 12" },
        { codigo: "N03", nombre: "Cliente Demo 13" },
      ],
      articulos: [
        {
          codigo: "NWD-PA-3003",
          descripcion: "Pantalon demo recto",
          clienteCodigo: "N01",
          temporadaCodigo: "26",
          subfamiliaCodigo: "PA",
        },
        {
          codigo: "NWD-VE-4004",
          descripcion: "Vestido demo linea A",
          clienteCodigo: "N02",
          temporadaCodigo: "27",
          subfamiliaCodigo: "VE",
        },
      ],
    },
  ];

  for (const def of defs) {
    const empresa = empresaMap.get(def.empresa);
    if (!empresa) continue;

    for (const c of def.clientes) {
      const row = await prisma.cliente.upsert({
        where: { empresaId_codigo: { empresaId: empresa.id, codigo: c.codigo } },
        update: { nombre: c.nombre },
        create: { empresaId: empresa.id, codigo: c.codigo, nombre: c.nombre },
        select: { id: true, empresaId: true },
      });
      outClientes.set(`${empresa.id}:${c.codigo}`, row);
    }

    for (const a of def.articulos) {
      const cliente = outClientes.get(`${empresa.id}:${a.clienteCodigo}`);
      const temporada = temporadaMap.get(a.temporadaCodigo);
      const subfamilia = subfamiliaMap.get(a.subfamiliaCodigo);
      if (!cliente || !temporada || !subfamilia) continue;

      const row = await prisma.articulo.upsert({
        where: { empresaId_codigo: { empresaId: empresa.id, codigo: a.codigo } },
        update: {
          descripcion: a.descripcion,
          clienteId: cliente.id,
          temporadaId: temporada.id,
          subfamiliaId: subfamilia.id,
        },
        create: {
          empresaId: empresa.id,
          codigo: a.codigo,
          descripcion: a.descripcion,
          clienteId: cliente.id,
          temporadaId: temporada.id,
          subfamiliaId: subfamilia.id,
        },
        select: { id: true, empresaId: true },
      });
      outArticulos.set(`${empresa.id}:${a.codigo}`, row);
    }
  }

  return { outClientes, outArticulos };
}

async function ensureEscandallosYPedidos(
  empresaMap: Map<string, { id: number; nombre: string }>,
  temporadaMap: Map<string, { id: number }>,
  outClientes: Map<string, { id: number }>,
  outArticulos: Map<string, { id: number }>,
) {
  const records = [
    {
      empresaSlug: "acme-demo",
      clienteCodigo: "C01",
      temporadaCodigo: "26",
      articuloCodigo: "ACM-BL-1001",
      modeloInterno: "ACM-MDL-1001",
      modeloCliente: "CL-1001-A",
      patron: "Patron Demo A",
      talla: "M",
      patronista: "Trabajador Demo 01",
      fecha: asDate("2026-01-10"),
      totalCoste: 27.5,
      porcentajeExtra: 12,
      observaciones: "Escandallo demo para pruebas de flujo.",
      pedidoNumero: "PED-DEMO-1001",
      pedidoFecha: asDate("2026-01-20"),
      entregaFecha: asDate("2026-02-14"),
      precioVenta: 42,
      pvp: 69,
      tallerCorte: "Taller Demo A",
      tallerConfeccion: "Taller Demo B",
      comentarioAutor: "Trabajador Demo 02",
      comentarioTexto: "Revisar tejido exterior en lote demo.",
    },
    {
      empresaSlug: "northwind-demo",
      clienteCodigo: "N01",
      temporadaCodigo: "27",
      articuloCodigo: "NWD-PA-3003",
      modeloInterno: "NWD-MDL-3003",
      modeloCliente: "CL-3003-N",
      patron: "Patron Demo B",
      talla: "40",
      patronista: "Trabajador Demo 03",
      fecha: asDate("2026-01-12"),
      totalCoste: 21.2,
      porcentajeExtra: 10,
      observaciones: "Escandallo demo orientado a pantaloneria.",
      pedidoNumero: "PED-DEMO-3003",
      pedidoFecha: asDate("2026-01-22"),
      entregaFecha: asDate("2026-02-18"),
      precioVenta: 35,
      pvp: 59,
      tallerCorte: "Taller Demo C",
      tallerConfeccion: "Taller Demo A",
      comentarioAutor: "Trabajador Demo 04",
      comentarioTexto: "Ajustar patron de cintura para siguiente iteracion.",
    },
  ];

  for (const r of records) {
    const empresa = empresaMap.get(r.empresaSlug);
    if (!empresa) continue;
    const cliente = outClientes.get(`${empresa.id}:${r.clienteCodigo}`);
    const temporada = temporadaMap.get(r.temporadaCodigo);
    const articulo = outArticulos.get(`${empresa.id}:${r.articuloCodigo}`);
    if (!cliente || !temporada || !articulo) continue;

    const existing = await prisma.escandallo.findFirst({
      where: {
        empresaId: empresa.id,
        clienteId: cliente.id,
        temporadaId: temporada.id,
        modeloInterno: r.modeloInterno,
      },
      select: { id: true },
    });

    const escandallo = existing
      ? await prisma.escandallo.update({
          where: { id: existing.id },
          data: {
            articuloId: articulo.id,
            modeloCliente: r.modeloCliente,
            patron: r.patron,
            talla: r.talla,
            patronista: r.patronista,
            fecha: r.fecha,
            totalCoste: r.totalCoste,
            porcentajeExtra: r.porcentajeExtra,
            observaciones: r.observaciones,
            estado: EstadoEscandallo.PRODUCCION,
            fechaAprobacion: asDate("2026-01-18"),
          },
          select: { id: true },
        })
      : await prisma.escandallo.create({
          data: {
            empresaId: empresa.id,
            clienteId: cliente.id,
            temporadaId: temporada.id,
            articuloId: articulo.id,
            modeloInterno: r.modeloInterno,
            modeloCliente: r.modeloCliente,
            patron: r.patron,
            talla: r.talla,
            patronista: r.patronista,
            fecha: r.fecha,
            totalCoste: r.totalCoste,
            porcentajeExtra: r.porcentajeExtra,
            observaciones: r.observaciones,
            estado: EstadoEscandallo.PRODUCCION,
            fechaAprobacion: asDate("2026-01-18"),
          },
          select: { id: true },
        });

    await prisma.escandalloTejido.deleteMany({ where: { escandalloId: escandallo.id } });
    await prisma.escandalloForro.deleteMany({ where: { escandalloId: escandallo.id } });
    await prisma.escandalloAccesorio.deleteMany({ where: { escandalloId: escandallo.id } });
    await prisma.escandalloGasto.deleteMany({ where: { escandalloId: escandallo.id } });

    await prisma.escandalloTejido.create({
      data: {
        escandalloId: escandallo.id,
        proveedor: "Proveedor Demo Tejidos",
        serie: "Serie TD-01",
        color: "Azul",
        anchoReal: 150,
        anchoUtil: 142,
        consumoMuestra: "1.25 m",
        consumoProduccion: 1.35,
        precio: 8.2,
        coste: 11.07,
      },
    });

    await prisma.escandalloForro.create({
      data: {
        escandalloId: escandallo.id,
        proveedor: "Proveedor Demo Forros",
        serie: "Forro F-10",
        color: "Gris",
        anchoReal: 145,
        anchoUtil: 138,
        consumoMuestra: "0.8 m",
        consumoProduccion: 0.82,
        precio: 4.3,
        coste: 3.53,
      },
    });

    await prisma.escandalloAccesorio.create({
      data: {
        escandalloId: escandallo.id,
        nombre: "Cremallera demo",
        proveedor: "Proveedor Demo Accesorios",
        referencia: "ACC-100",
        color: "Negro",
        unidad: "UNIDADES",
        cantidad: 1,
        precioUnidad: 0.75,
        coste: 0.75,
      },
    });

    await prisma.escandalloGasto.create({
      data: {
        escandalloId: escandallo.id,
        tipo: "CONFECCION",
        descripcion: "Mano de obra demo",
        importe: 5.6,
      },
    });

    const existingPedido = await prisma.pedido.findFirst({
      where: {
        empresaId: empresa.id,
        escandalloId: escandallo.id,
        numeroPedido: r.pedidoNumero,
      },
      select: { id: true },
    });

    const pedido = existingPedido
      ? await prisma.pedido.update({
          where: { id: existingPedido.id },
          data: {
            fechaPedido: r.pedidoFecha,
            fechaEntrega: r.entregaFecha,
            modeloInterno: r.modeloInterno,
            modeloCliente: r.modeloCliente,
            patron: r.patron,
            descripcionPedido: `Pedido demo ${r.modeloInterno}`,
            costeEscandallo: r.totalCoste,
            precioVenta: r.precioVenta,
            pvp: r.pvp,
            tallerCorte: r.tallerCorte,
            fechaCorte: asDate("2026-01-25"),
            albaranCorte: `ALB-CORTE-${r.modeloInterno}`,
            precioCorte: 3.4,
            tallerConfeccion: r.tallerConfeccion,
            fechaConfeccion: asDate("2026-01-30"),
            albaranConfeccion: `ALB-CONF-${r.modeloInterno}`,
            precioConfeccion: 6.1,
            preparacionAlmacen: {
              perchas: true,
              embolsado: true,
              etiquetado: true,
            },
            controlCalidad: {
              resultado: "APTO",
              incidencias: 0,
            },
            observaciones: "Pedido demo para recorrido funcional.",
            facturado: true,
            numeroFactura: `FAC-${r.modeloInterno}`,
            fechaFactura: asDate("2026-02-05"),
          },
          select: { id: true },
        })
      : await prisma.pedido.create({
          data: {
            empresaId: empresa.id,
            escandalloId: escandallo.id,
            numeroPedido: r.pedidoNumero,
            fechaPedido: r.pedidoFecha,
            fechaEntrega: r.entregaFecha,
            modeloInterno: r.modeloInterno,
            modeloCliente: r.modeloCliente,
            patron: r.patron,
            descripcionPedido: `Pedido demo ${r.modeloInterno}`,
            costeEscandallo: r.totalCoste,
            precioVenta: r.precioVenta,
            pvp: r.pvp,
            tallerCorte: r.tallerCorte,
            fechaCorte: asDate("2026-01-25"),
            albaranCorte: `ALB-CORTE-${r.modeloInterno}`,
            precioCorte: 3.4,
            tallerConfeccion: r.tallerConfeccion,
            fechaConfeccion: asDate("2026-01-30"),
            albaranConfeccion: `ALB-CONF-${r.modeloInterno}`,
            precioConfeccion: 6.1,
            preparacionAlmacen: {
              perchas: true,
              embolsado: true,
              etiquetado: true,
            },
            controlCalidad: {
              resultado: "APTO",
              incidencias: 0,
            },
            observaciones: "Pedido demo para recorrido funcional.",
            facturado: true,
            numeroFactura: `FAC-${r.modeloInterno}`,
            fechaFactura: asDate("2026-02-05"),
          },
          select: { id: true },
        });

    await prisma.pedidoTejido.deleteMany({ where: { pedidoId: pedido.id } });
    await prisma.pedidoForro.deleteMany({ where: { pedidoId: pedido.id } });
    await prisma.pedidoAccesorio.deleteMany({ where: { pedidoId: pedido.id } });
    await prisma.pedidoColor.deleteMany({ where: { pedidoId: pedido.id } });
    await prisma.pedidoComentario.deleteMany({ where: { pedidoId: pedido.id } });

    await prisma.pedidoTejido.create({
      data: {
        pedidoId: pedido.id,
        proveedor: "Proveedor Demo Tejidos",
        serie: "Serie TD-01",
        color: "Azul",
        consumoProduccion: 1.35,
        composicion: "62% poliester / 38% algodon",
        metrosPedidos: 180,
        fechaPedido: r.pedidoFecha,
        metrosRecibidos: 170,
        fechaMetrosRecibidos: asDate("2026-01-27"),
        consumoCorte: 1.25,
      },
    });

    await prisma.pedidoForro.create({
      data: {
        pedidoId: pedido.id,
        proveedor: "Proveedor Demo Forros",
        serie: "Forro F-10",
        color: "Gris",
        consumoProduccion: 0.82,
        composicion: "100% poliester",
        metrosPedidos: 95,
        fechaPedido: r.pedidoFecha,
        metrosRecibidos: 92,
        fechaMetrosRecibidos: asDate("2026-01-28"),
        consumoCorte: 0.78,
      },
    });

    await prisma.pedidoAccesorio.create({
      data: {
        pedidoId: pedido.id,
        nombre: "Boton demo 18mm",
        proveedor: "Proveedor Demo Accesorios",
        referencia: "BTN-18",
        color: "Negro",
        unidad: "UNIDADES",
        consumoEsc: 4,
        cantidadPed: 1000,
        fechaPedido: r.pedidoFecha,
        unidadesRecibidas: 1000,
        fechaRecibidas: asDate("2026-01-29"),
        albaranAccesorio: `ALB-ACC-${r.modeloInterno}`,
      },
    });

    await prisma.pedidoColor.create({
      data: {
        pedidoId: pedido.id,
        color: "Negro",
        tipoTalla: "LETRAS",
        distribucion: {
          tallas: ["S", "M", "L", "XL"],
          unidades: [40, 80, 60, 20],
          total: 200,
        },
      },
    });

    await prisma.pedidoComentario.create({
      data: {
        pedidoId: pedido.id,
        autor: r.comentarioAutor,
        texto: r.comentarioTexto,
        tipo: "ALMACEN",
      },
    });
  }
}

async function ensureRRHH(empresaMap: Map<string, { id: number }>, users: Map<string, { id: string }>) {
  const admin = users.get("demo_admin");
  const rrhh = users.get("demo_rrhh");
  const almacen = users.get("demo_almacen");
  if (!admin || !rrhh || !almacen) return;

  for (const empresa of empresaMap.values()) {
    await prisma.timeHoliday.upsert({
      where: { empresaId_date: { empresaId: empresa.id, date: asDate("2026-01-01") } },
      update: { name: "Ano Nuevo (Demo)" },
      create: { empresaId: empresa.id, date: asDate("2026-01-01"), name: "Ano Nuevo (Demo)" },
    });

    await prisma.timeCompanyVacation.deleteMany({ where: { empresaId: empresa.id } });
    await prisma.timeCompanyVacation.create({
      data: {
        empresaId: empresa.id,
        from: asDate("2026-08-10"),
        to: asDate("2026-08-16"),
        reason: "Cierre de verano demo",
      },
    });

    for (const userId of [admin.id, rrhh.id, almacen.id]) {
      await prisma.timeVacationBalance.upsert({
        where: { empresaId_userId_year: { empresaId: empresa.id, userId, year: 2026 } },
        update: { carryoverDays: 2, entitledDays: 23 },
        create: { empresaId: empresa.id, userId, year: 2026, carryoverDays: 2, entitledDays: 23 },
      });
    }

    const req = await prisma.timeVacationRequest.upsert({
      where: {
        id: (
          await prisma.timeVacationRequest.findFirst({
            where: { empresaId: empresa.id, userId: almacen.id, from: asDate("2026-03-10") },
            select: { id: true },
          })
        )?.id ?? -1,
      },
      update: {
        to: asDate("2026-03-12"),
        reason: "Vacaciones demo",
        status: TimeVacationStatus.APPROVED,
        decidedById: rrhh.id,
        decidedAt: asDate("2026-02-15"),
        decisionNote: "Aprobada en entorno demo",
      },
      create: {
        empresaId: empresa.id,
        userId: almacen.id,
        from: asDate("2026-03-10"),
        to: asDate("2026-03-12"),
        reason: "Vacaciones demo",
        status: TimeVacationStatus.APPROVED,
        decidedById: rrhh.id,
        decidedAt: asDate("2026-02-15"),
        decisionNote: "Aprobada en entorno demo",
      },
      select: { id: true },
    });

    await prisma.timeDay.upsert({
      where: { userId_empresaId_date: { userId: almacen.id, empresaId: empresa.id, date: asDate("2026-03-10") } },
      update: {
        type: TimeDayType.VACATION,
        vacationRequestId: req.id,
        note: "Vacaciones aprobadas demo",
      },
      create: {
        userId: almacen.id,
        empresaId: empresa.id,
        date: asDate("2026-03-10"),
        type: TimeDayType.VACATION,
        vacationRequestId: req.id,
        note: "Vacaciones aprobadas demo",
      },
    });

    await prisma.timeDay.upsert({
      where: { userId_empresaId_date: { userId: admin.id, empresaId: empresa.id, date: asDate("2026-02-11") } },
      update: {
        morningIn: "08:00",
        morningOut: "14:00",
        afternoonIn: "15:00",
        afternoonOut: "17:30",
        type: TimeDayType.WORK,
        signedAt: asDate("2026-02-11"),
        signedById: admin.id,
        lockedAt: asDate("2026-02-11"),
      },
      create: {
        userId: admin.id,
        empresaId: empresa.id,
        date: asDate("2026-02-11"),
        morningIn: "08:00",
        morningOut: "14:00",
        afternoonIn: "15:00",
        afternoonOut: "17:30",
        type: TimeDayType.WORK,
        signedAt: asDate("2026-02-11"),
        signedById: admin.id,
        signMethod: "PASSWORD",
        lockedAt: asDate("2026-02-11"),
      },
    });
  }
}

async function ensureChatYNotificaciones(
  empresaMap: Map<string, { id: number; nombre: string }>,
  users: Map<string, { id: string; name: string }>,
) {
  const admin = users.get("demo_admin");
  const rrhh = users.get("demo_rrhh");
  const almacen = users.get("demo_almacen");
  if (!admin || !rrhh || !almacen) return;

  const global = await prisma.chatThread.findFirst({
    where: { type: ChatThreadType.GLOBAL },
    select: { id: true },
  });

  const globalThread = global
    ? await prisma.chatThread.update({ where: { id: global.id }, data: { name: "General" }, select: { id: true } })
    : await prisma.chatThread.create({ data: { type: ChatThreadType.GLOBAL, name: "General" }, select: { id: true } });

  for (const u of [admin, rrhh, almacen]) {
    await prisma.chatThreadMember.upsert({
      where: { threadId_userId: { threadId: globalThread.id, userId: u.id } },
      update: {},
      create: { threadId: globalThread.id, userId: u.id },
    });
  }

  for (const [slug, empresa] of empresaMap) {
    const existing = await prisma.chatThread.findFirst({
      where: { type: ChatThreadType.EMPRESA, empresaId: empresa.id },
      select: { id: true },
    });

    const thread = existing
      ? await prisma.chatThread.update({ where: { id: existing.id }, data: { name: `Canal ${empresa.nombre}` }, select: { id: true } })
      : await prisma.chatThread.create({
          data: { type: ChatThreadType.EMPRESA, empresaId: empresa.id, name: `Canal ${empresa.nombre}` },
          select: { id: true },
        });

    for (const u of [admin, rrhh, almacen]) {
      await prisma.chatThreadMember.upsert({
        where: { threadId_userId: { threadId: thread.id, userId: u.id } },
        update: {},
        create: { threadId: thread.id, userId: u.id },
      });
    }

    const hasMessages = await prisma.chatMessage.count({ where: { threadId: thread.id } });
    if (hasMessages === 0) {
      await prisma.chatMessage.createMany({
        data: [
          {
            threadId: thread.id,
            authorId: admin.id,
            empresaId: empresa.id,
            type: ChatMessageType.USER,
            body: `Bienvenidos al canal de ${empresa.nombre}.`,
          },
          {
            threadId: thread.id,
            authorId: rrhh.id,
            empresaId: empresa.id,
            type: ChatMessageType.SYSTEM,
            body: "Recordatorio demo: revisar vacaciones y fichajes pendientes.",
          },
        ],
      });
    }

    await prisma.notification.create({
      data: {
        userId: admin.id,
        empresaId: empresa.id,
        type: NotificationType.CUSTOM_SYSTEM,
        title: `Demo listo para ${slug}`,
        body: "Dataset de demostracion inicializado correctamente.",
        href: `/${slug}`,
        dedupeKey: `DEMO_READY:${empresa.id}`,
      },
    }).catch(() => undefined);
  }
}

export async function runDemoSeed() {
  if (!DEMO_MODE) {
    console.log("DEMO_MODE=false: seed omitido para evitar cargar datos demo.");
    return;
  }

  console.log("Inicializando dataset DEMO...");

  const groups = await ensureGroups();
  const empresas = await ensureEmpresas();
  const temporadas = await ensureTemporadas();
  const subfamilias = await ensureSubfamilias();
  const users = await ensureUsers(groups, empresas as Map<string, { id: number }>);

  const { outClientes, outArticulos } = await ensureMaestros(empresas as Map<string, { id: number }>, temporadas, subfamilias);

  await ensureEscandallosYPedidos(empresas as Map<string, { id: number; nombre: string }>, temporadas, outClientes, outArticulos);
  await ensureRRHH(empresas as Map<string, { id: number }>, users as Map<string, { id: string }>);
  await ensureChatYNotificaciones(empresas as Map<string, { id: number; nombre: string }>, users as Map<string, { id: string; name: string }>);

  console.log("Seed DEMO completado.");
  console.log(`Usuarios demo (password comun): ${DEMO_PASSWORD}`);
  console.log("- demo_admin / admin.demo@example.com");
  console.log("- demo_rrhh / rrhh.demo@example.com");
  console.log("- demo_almacen / almacen.demo@example.com");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDemoSeed()
    .catch((e) => {
      console.error("Seed error:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

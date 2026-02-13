# Guia de Uso

## Login
Usa un usuario demo:
- `demo_admin`
- `demo_rrhh`
- `demo_almacen`
Password: `demo1234`
Nota: credenciales publicas de demostracion, no conectadas a ningun entorno productivo.

## Modulos

### 1) Home / Empresas
- Selecciona `acme-demo` o `northwind-demo`.
- Revisa indicadores de clientes, escandallos y pedidos.

### 2) Maestros
- Clientes: alta/edicion/listado por empresa.
- Articulos: filtros por cliente/temporada/subfamilia.
- Temporadas/Subfamilias: catalogo base.

### 3) Fichas / Escandallos
- Navega por cliente -> temporada -> escandallo.
- Consulta tejidos, forros, accesorios y gastos.

### 4) Pedidos y Produccion
- Abre pedido asociado al escandallo.
- Revisa colores, comentarios, facturacion y estado.

### 5) RRHH
- Control horario: dias firmados y tipos de jornada.
- Vacaciones: solicitudes, aprobaciones y saldos anuales.
- Calendario: festivos y cierres de empresa.

### 6) Chat y notificaciones
- Canales globales/empresa disponibles con seed.
- Notificaciones demo visibles desde campana de usuario.

### 7) Asistente IA
- En empresa, abre asistente y consulta modelos demo (`ACM-MDL-1001`).
- En DEMO_MODE hay fallback mock cuando no hay LLM externo.

### 8) Integraciones
- Globalia Stock: disponible con mock (status/preview/catalogo/export demo).
- EDIWIN Parser: preview/export/folders/split mock en DEMO_MODE.

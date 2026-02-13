# Demo Tour (Public Demo)

Este documento describe el recorrido guiado integrado en la app para enseñar las funcionalidades principales usando **solo rutas reales**.

## Ruta
- `/<empresa>/demo-tour`

## Pasos (8)
1. `/<empresa>` — Panel de empresa (home)
2. `/<empresa>/maestros` — Acceso a maestros (clientes/artículos/temporadas/subfamilias)
3. `/<empresa>/maestros/clientes` — Clientes (CRUD/listado por empresa)
4. `/<empresa>/fichas` — Flujo fichas (escandallos/pedidos)
5. `/<empresa>/rrhh/control-horario` — RRHH (fichajes/jornada)
6. `/<empresa>/legacy` — Legacy (consulta/lectura)
7. `/tools/almacen` — Herramientas de almacén
8. `/account/chat` — Chat, notificaciones e IA (con enlaces rápidos a `/account/notifications` y `/<empresa>/admin/ai/dashboard`)

> Nota: Los enlaces están definidos en `app/(app)/[empresa]/demo-tour/_steps.ts`.

## Validación automática
- Ejecuta: `npm run demo-tour:validate`
- Comprueba que cada `href` del tour (incluyendo enlaces extra de cada card) corresponde a un `page.tsx` real en `app/(app)/[empresa]` o `app/(app)/...`.

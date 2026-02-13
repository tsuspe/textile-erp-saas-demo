# Architecture

## High-level
```text
[Browser]
   |
   v
[Next.js App Router - webapp-excel]
   |  \ 
   |   \-- [Prisma Client] --> [PostgreSQL]
   |
   |-- [Realtime token endpoint] --> [Socket.IO server - realtime]
   |
   |-- [Tools API]
       |-- EDIWIN route (Python CLI or DEMO mock)
       |-- Globalia route (Python CLI or DEMO mock)
       |-- AI route (tools + LLM fallback or DEMO mock)
```

## Bounded modules
- Auth/session: NextAuth credentials.
- Multi-tenant core: Empresa + UserEmpresa.
- Product domain: Cliente/Articulo/Escandallo/Pedido.
- HR domain: TimeDay/TimeVacation*/TimeHoliday.
- Comms domain: ChatThread/ChatMessage/Notification.
- Integrations domain: EDIWIN + Globalia adapters.

## DB notes
- Tenant boundary via `empresaId` in key models.
- Composite uniques used for tenant-safe masters:
  - `Cliente @@unique([empresaId, codigo])`
  - `Articulo @@unique([empresaId, codigo])`
- Chat supports GLOBAL, EMPRESA, GROUP, DM.

## Demo mode boundary
`DEMO_MODE=true` intercepts external dependencies in API routes:
- avoids private network/services
- returns deterministic mock payloads
- preserves UI/UX flows

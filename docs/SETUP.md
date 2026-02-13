# Setup Detallado

## Requisitos
- Node.js 20+
- npm 10+
- PostgreSQL 16+ (o Docker)
- Python 3.11+ (opcional para integraciones reales)

## 1) Clonar y preparar entorno
```bash
cp webapp-excel/.env.example webapp-excel/.env
cp realtime/.env.example realtime/.env
```

Ajustes minimos:
- `DATABASE_URL`
- `NEXTAUTH_SECRET` / `AUTH_SECRET`
- `REALTIME_JWT_SECRET` / `REALTIME_INTERNAL_TOKEN`
- `DEMO_MODE=true`

## 2) Base de datos
Con Docker (desde raiz):
```bash
export POSTGRES_PASSWORD=demo_local_password
docker compose up -d db
```

Migraciones + seed:
```bash
cd webapp-excel
npx prisma migrate deploy
npm run db:seed
```

Reset demo completo:
```bash
npm run demo-reset
```

## 3) Arranque de servicios
Terminal A:
```bash
cd realtime
npm install
npm start
```

Terminal B:
```bash
cd webapp-excel
npm install
npm run dev
```

App: `http://localhost:3000`

## 4) Modo demo vs modo real
- `DEMO_MODE=true`: integraciones externas en mock y dataset sintetico.
- `DEMO_MODE=false`: usa providers reales (Ollama/Python/routes configuradas).

## 5) Troubleshooting rapido
- Error auth: revisar `NEXTAUTH_SECRET`, `AUTH_SECRET`, `NEXTAUTH_URL`.
- Error realtime token: revisar secretos compartidos entre `webapp-excel` y `realtime`.
- Error prisma: comprobar conectividad y credenciales de `DATABASE_URL`.
- Error Python integraciones: en demo usar `DEMO_MODE=true`.

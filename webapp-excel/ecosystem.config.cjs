// ecosystem.config.cjs
// Example PM2 config for DEMO environments.
// Public repo note: values are placeholders and must be replaced per local environment.

module.exports = {
  apps: [
    {
      name: "fichas-demo",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: ["start", "-p", "3000"],
      env: {
        NODE_ENV: "production",
        DEMO_MODE: "true",

        DATABASE_URL:
          "postgresql://demo_user:demo_password@localhost:5432/fichas_demo?schema=public",

        LEGACY_ROOT: "./demo-assets/legacy",
        UPLOADS_DIR: "./public/uploads",

        NEXTAUTH_SECRET: "CHANGE_ME_LONG_RANDOM_SECRET",
        AUTH_SECRET: "CHANGE_ME_LONG_RANDOM_SECRET",
        NEXTAUTH_URL: "http://localhost:3000",
        AUTH_TRUST_HOST: "true",

        REALTIME_URL: "http://localhost:3001",
        NEXT_PUBLIC_REALTIME_URL: "http://localhost:3001",
        REALTIME_JWT_SECRET: "CHANGE_ME_REALTIME_JWT_SECRET",
        REALTIME_INTERNAL_TOKEN: "CHANGE_ME_REALTIME_INTERNAL_TOKEN",

        OLLAMA_BASE_URL: "http://localhost:11434",
        OLLAMA_MODEL: "phi3:mini",

        PYTHON_BIN: "python3",

        EDIWIN_STAGING_DIR: "./data/ediwin/staging",
        EDIWIN_OUT_EUROFIEL_DIR: "./data/ediwin/out/eurofiel",
        EDIWIN_OUT_ECI_DIR: "./data/ediwin/out/eci",

        GLOBALIA_INV_PATH: "./data/demo/datos_almacen.json",
        GLOBALIA_PREV_PATH: "./data/demo/prevision.json",
        GLOBALIA_TALLERES_PATH: "./data/demo/talleres.json",
        GLOBALIA_CLIENTES_PATH: "./data/demo/clientes.json",
        GLOBALIA_EXPORT_DIR: "./data/demo/EXPORT_DIR",
        GLOBALIA_BACKUP_DIR: "./data/demo/backups",

        BACKUP_ROOT_DIR: "./data/backups",
        PG_DUMP_BIN: "pg_dump",
        PG_RESTORE_BIN: "pg_restore",

        SUPERUSER_PASSWORD: "CHANGE_ME_DEMO_ADMIN_PASSWORD",
      },
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: "realtime-demo",
      cwd: __dirname,
      script: "../realtime/server.js",
      env: {
        NODE_ENV: "production",
        REALTIME_PORT: "3001",
        REALTIME_HOST: "0.0.0.0",
        REALTIME_JWT_SECRET: "CHANGE_ME_REALTIME_JWT_SECRET",
        REALTIME_INTERNAL_TOKEN: "CHANGE_ME_REALTIME_INTERNAL_TOKEN",
        REALTIME_CORS_ORIGIN: "http://localhost:3000",
      },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};

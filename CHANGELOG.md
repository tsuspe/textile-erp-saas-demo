# Changelog

## v0.1.0-demo - 2026-02-13
- Sanitized repository for public demo publication.
- Removed secrets, private env files, real uploads/backups, and private archives.
- Replaced business/PII datasets with synthetic demo datasets.
- Added `DEMO_MODE` support and mock behavior for AI/EDIWIN/Globalia integrations.
- Reworked Prisma seed for multi-tenant demo data and role-based demo users.
- Added `demo-reset` command.
- Added full public-facing documentation (`README`, `docs/*`, `SECURITY`, `CONTRIBUTING`).
- Added root and per-service `.env.example` files and hardened `.gitignore`.

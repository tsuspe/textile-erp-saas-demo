# Contributing

## Setup
1. Follow `docs/SETUP.md`.
2. Use `DEMO_MODE=true` by default.
3. Validate with `npm run lint` and functional smoke checks.

## Branch and PR conventions
- Use focused branches per concern (`feat/demo-seed`, `fix/security-scan`, etc.).
- Keep PRs small and atomic.
- Include:
  - what changed
  - why
  - how to verify
  - security/privacy impact

## Code style
- TypeScript strict-friendly changes.
- Prisma changes require migration and seed updates.
- Do not commit secrets, personal data, real customer files, or internal paths.

## Required checks before PR
- `npm run lint` (webapp)
- app boot locally
- `npm run db:seed` or `npm run demo-reset`
- quick navigation across core modules (maestros, fichas, RRHH, chat, tools)

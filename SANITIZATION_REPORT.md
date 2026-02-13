# Sanitization Report (Demo Publication)

## Scope
- Repository converted to public-safe demo variant.
- Objective: remove secrets/PII/internal infra references while preserving key workflows.

## Architecture Map
- Frontend/API: `webapp-excel` (Next.js App Router, TypeScript).
- Realtime: `realtime` (Node.js + Socket.IO + JWT).
- DB layer: Prisma + PostgreSQL (`webapp-excel/prisma/schema.prisma`).
- Integrations: EDIWIN parser (Python), Globalia Stock toolkit (Python), local backup utilities.
- Data folders: `data/globalia`, `data/uploads`, `webapp-excel/public/uploads`, `webapp-excel/demo-assets`.

## Sensitive Findings and Mitigations
| ID | Finding | Location | Risk | Mitigation | Status |
|---|---|---|---|---|---|
| S-01 | Hardcoded realtime JWT/internal tokens | `realtime/.env` | Secret exposure | Removed file, added `realtime/.env.example` placeholders | DONE |
| S-02 | Hardcoded auth/database/realtime secrets | `webapp-excel/ecosystem.config.cjs` | Secret exposure | Replaced with demo placeholders and local-safe defaults | DONE |
| S-03 | Real personal/company identifiers in seed | `webapp-excel/prisma/seed.ts` | PII/business disclosure | Rewrote seed with synthetic users/companies/records | DONE |
| S-04 | Real client/taller datasets and backups | `data/globalia/*` and backups | PII/business disclosure | Replaced by synthetic JSON/CSV demo datasets | DONE |
| S-05 | Real uploaded assets/images | `data/uploads/*`, `webapp-excel/public/uploads/*` | Possible PII leakage | Removed files; kept `.gitkeep` only | DONE |
| S-06 | Internal paths/hosts in scripts/configs | multiple files | Infra disclosure | Replaced with local demo paths and placeholders | DONE |
| S-07 | Vendored runtime deps committed | `realtime/node_modules` | Supply-chain/repo hygiene risk | Removed and ignored in `.gitignore` | DONE |
| S-08 | Private archive with project snapshots | `webapp-excel/ediwin_parser_review.zip` | Data/code leakage | Removed from repo | DONE |
| S-09 | Real maestro export data | `webapp-excel/prisma/_export/maestros.json` | Business data disclosure | Replaced with synthetic export sample | DONE |
| S-10 | Production-like defaults in legacy/integration routes | API routes and Python tools | Internal infra leakage | Updated to demo-safe defaults + DEMO_MODE mocks | DONE |

## Feature Flags / Demo Mode
- Added `DEMO_MODE` (`webapp-excel/.env.example`).
- In `DEMO_MODE=true`:
  - AI route falls back to deterministic demo response if tools do not resolve.
  - EDIWIN route runs mock responses for preview/export/folders/split actions.
  - Globalia route serves mock responses/zip output without external dependencies.

## Files Removed or Replaced
- Removed: `realtime/.env`, `realtime/node_modules/`, `webapp-excel/ediwin_parser_review.zip`, `webapp-excel/prisma/dev.db`, real uploads, real backup dumps.
- Replaced: `data/globalia/*.json`, `data/globalia/EXPORT_DIR/*.csv`, `webapp-excel/prisma/_export/maestros.json`, `webapp-excel/ecosystem.config.cjs`.

## Git Hygiene Notes
- This workspace copy has no `.git` metadata; commits/history rewrite cannot be executed here.
- If original private repo history contains leaked secrets, run one of:
  - `git filter-repo --path <file> --invert-paths`
  - BFG Repo-Cleaner for keys/tokens and large sensitive blobs
- Rotate any previously exposed credentials before publication.

## Final Checklist
- [x] No active secrets left in tracked files.
- [x] No real user/customer/taller datasets in tracked files.
- [x] No internal hostnames/private UNC paths/IPs in tracked runtime defaults.
- [x] Demo seed creates synthetic, multi-tenant data.
- [x] Integrations support mock mode via `DEMO_MODE`.
- [x] `.env.example` files present with placeholders.
- [x] `.gitignore` updated to prevent future leakage.


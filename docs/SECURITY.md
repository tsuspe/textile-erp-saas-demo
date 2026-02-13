# Security Notes

## Threat model (basic)
- Secret leakage in source/history.
- PII leakage in fixtures/uploads/backups.
- Internal infra disclosure via paths/hosts/IPs.
- Runtime misuse of integration endpoints.

## Controls applied in demo
- Secrets removed and replaced by placeholders (`.env.example`).
- Real datasets removed/replaced with synthetic data.
- Internal paths/hosts removed from runtime defaults.
- Upload and backup directories cleaned and ignored by git.
- `DEMO_MODE` enforces mock behavior for external integrations.

## Reviewer checklist
- [x] No committed `.env` with live credentials.
- [x] No private keys/tokens/passwords in tracked files.
- [x] No real personal/company identity data in seeds/fixtures.
- [x] No internal UNC paths/IP/domain references in active defaults.
- [x] Public docs describe demo constraints clearly.

## If publishing original history
Use history rewrite + credential rotation:
1. `git filter-repo` or BFG to purge leaks.
2. Rotate any key/token ever present in old commits.
3. Force-push sanitized branch and revoke stale clones.

# 0086. deploy.sh checks replication first, records each deploy, and rolls back past a migration

- Status: Accepted
- Date: 2026-11-07

## Context
`deploy/vm/deploy.sh` pulls, sets `ATLAS_VERSION`, restarts and waits for `/api/health`. Rollback is "deploy the previous version". With forward-only migrations that no longer works across a schema change, because the previous version refuses a newer database. Nothing checks the bucket is current before an upgrade either.

## Decision
- **Health:** `GET /api/health` (localhost only) returns `version`, `schema` and the stored replication state.
- **Preflight:** `deploy.sh` refuses to start an upgrade when replication is failing or its last check is stale. `--force` overrides it.
- **History:** after a healthy deploy it prints the version and schema change, and appends `<time> <version> <schema>` to `/var/lib/atlas/deploys.log`.
- **Rollback:** `deploy.sh <previous> --restore-pre-migration`:
  - stops the stack;
  - moves the live database aside as `rolled-back-…`;
  - puts back the newest pre-migration copy for that schema step;
  - deploys `<previous>`.
  The file work is a tested TypeScript script run in the app image; `deploy.sh` orchestrates. Litestream point-in-time restore stays in the runbook as the fallback.
- One script stays the only way to deploy.

## Consequences
- A rollback loses writes made since the upgrade (kept in the rolled-back file).
- Litestream sees a replaced file and starts a new generation. Proven once on the VM before 1.0.
- The first deploy on a new VM needs `--force` (nothing to check yet).

## Alternatives considered
- A separate `upgrade.sh`: two scripts drift.
- Rolling back by point-in-time restore: needs the bucket and a timestamp, under pressure.

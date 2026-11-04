# 0080. The PO token provider gets its own health kind, which needs schema 12

- Status: Accepted
- Date: 2026-11-04

## Context
ADR 0079 adds a Status row for the PO token provider, and TRD §11 calls its kind `pot_provider`. `health_status` and `health_errors` carry a `CHECK` that lists the kinds recorded for the whole app (`user_id` NULL): `agent`, `whisper`, `backup`, `transcription`, `replication`. SQLite would refuse a `pot_provider` row. The VM's database has already applied the migration that wrote that list (schema 11), so editing it would change nothing there. The TRD did not mention this. While checking the vendor facts for task 8.1 the extractor argument also turned out to differ from the TRD's hint (below).

## Decision
- **A third migration, schema 12**, rebuilds both health tables with `'pot_provider'` in the `CHECK`, copying every row and recreating `health_errors_subject`. The same table-rebuild pattern as the previous migration.
- The kind is an `AppHealthKind` (admin-only, one `default` subject), recorded through `recordCheck`, and its row is pruned at start when `POT_PROVIDER_URL` is unset.
- **The extractor argument is `youtubepot-bgutilhttp:base_url=<url>`**, as the plugin's 2.0.2 README documents; the older `youtube:getpot_bgutil_baseurl` named in TRD §11 is not used. Checked on the real standalone `yt-dlp_linux`: `PO Token Providers: bgutil:http-2.0.2`.
- The provider's ping is `GET /ping` returning `{ "server_uptime": number, "version": string }`; the row's detail shows the version.

## Consequences
- This changes TRD §11 (argument name, schema 12). The ADR overrides the TRD until Naresh updates it.
- Starting this release on a database at schema 11 copies it to `pre-migration/` first. A database at schema 12 is refused by a build that only knows 11, so going back to an earlier build means restoring the database (the runbook already says so for schema changes).
- The next new app-wide health kind needs another migration, for the same reason.

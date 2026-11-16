# 0111. Metis: statement imports, review before posting, and manual accounts

- Status: Accepted
- Date: 2026-11-16

## Context
Metis is the finance module, first planned for 1.1. Naresh banks with DBS: the Multiplier account exports a CSV, and the credit card arrives as a monthly PDF statement. He wants to see where his money goes and what he is worth, and to give his Financial goals in Themis a real signal. There is no bank API in scope, and statements hold his most sensitive data.

## Decision
- **Sources:** the DBS CSV is parsed exactly in code, with no Claude call. The card PDF is extracted by one Claude call in Express (ADR 0103: a single bounded input), Sonnet by default. The extracted lines must **reconcile** against the statement's own totals, or the import is blocked until edited.
- **Review before posting:** every import is a draft until approved. Duplicates (by fingerprint) are flagged and skipped. Transfers between the user's own accounts are proposed as matches and count as neither spending nor income.
- **Files are deleted once an import is posted or discarded.** While it is open, the file sits on the data volume outside the database, so Litestream never copies it. Only extracted data is kept.
- **Categories** are one flat, editable list per user, seeded with twelve defaults. Rules (plain phrases) come first, and the longest matching phrase wins. The rest go to one Claude call per import (Haiku by default), grouped by full description, choosing only from the user's categories or Uncategorised.
- **Manual accounts** (asset or liability) hold balance snapshots only. Net worth = imported balances plus the latest manual snapshots, with liabilities subtracted.
- **Themis:** a goal can track savings rate or net worth against a target, read from Metis at request time.
- **Storage:** SQLite (migration 21), money in integer cents, SGD. Raw extraction output goes in a JSON column on the import.

## Consequences
- A new bank or format is a new parser or extraction prompt, not a schema change.
- A statement that can't be reconciled can't be posted, so the ledger only holds imports that add up.
- A bad extraction found after posting means re-uploading that statement, because the file is gone.
- Claude sees full card statements and transaction descriptions. They are never logged (ADR 0049).

## Alternatives considered
- **A hand-written PDF parser:** brittle against layout changes, with no saving for one statement a month.
- **A document store:** the data is relational (accounts, transfers, monthly aggregates), and a second datastore would need its own backup and upgrade story.
- **Keeping the statements as an archive:** they would be replicated to GCS forever, and they're never needed once reviewed.
- **Sub-categories, spending caps:** deferred until budgets.

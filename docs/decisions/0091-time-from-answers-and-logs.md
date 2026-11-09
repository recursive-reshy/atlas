# 0091. Time spent is measured from saved answers and logged by hand, in one table

- Status: Accepted
- Date: 2026-11-07

## Context
Themis shows where time goes. Melete is the only module with activity worth timing, and most study (Obsidian, outside courses, books) happens elsewhere.

## Decision
- **Measured:** answers in one subject less than 5 minutes apart form a session, timed from the first answer to the last plus 30 seconds for the final card. Both numbers are per-user settings. Sessions are extended as each answer is saved, in the same transaction.
- **Logged:** minutes against a subject or a goal, on a day (back-dated up to a year), with an optional note; editable.
- Both live in `time_entries` with a `source` column. Measured entries can't be edited.
- **No credit** for video length or article reading time.

## Consequences
- No new client tracking, no heartbeat endpoint, nothing to double-count across tabs or devices.
- Reading notes inside Melete isn't measured; it is logged like any other study.

## Alternatives considered
- Browser heartbeats: catches reading, but needs tab-visibility and idle logic, and breaks when a phone sleeps.
- Crediting Mnemosyne content time: an estimate, and wrong at 2× speed or skimming.

# Atlas v1.1.1 — Product Requirements

A hardening and tidy-up release. Nothing a user does changes; what changes is what the app refuses, how fast two screens load, and how much of the repo is description rather than code. Decided with Naresh on 2026-11-09 after a full code review.

## Why
- Three gaps a reviewer would flag: the server fetches any URL a user types with no address check; a removed user's vault folder can be claimed by the other user; ingested text goes into Claude prompts with nothing marking it as untrusted.
- The job list reads every stored transcript on every poll and does a disk lookup per job.
- The `CLAUDE.md` files, README and architecture doc described the code three times over, at 87 KB, and Claude Code read them every session.
- The web app's `src/` root held 36 loose files and three folders sorted by file kind, not by feature.

## What a user notices
- A job for an address on the local network or a private range fails with "That address can't be fetched".
- The vault picker never offers a folder that belonged to a removed or reset user.
- Nothing else. Every page, endpoint and note is as before.

## What Naresh notices
- Each `CLAUDE.md` is rules only; the README is a front door; `docs/architecture.md` is the one description of how the system works.
- The web app is organised by feature under `src/features/`.
- A queued job starts at once instead of within a second.
- Commit messages are plain conventional commits (`fix: …`), no version or task scope.

## Out of scope
New features of any kind; folding the Python agent into Express (revisited in 1.2.0); the per-user Compose sync services beyond documenting them.

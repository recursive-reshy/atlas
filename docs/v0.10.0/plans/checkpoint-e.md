# Checkpoint E plan — Atlas v0.10.0, phase 7 (tasks 7.1–7.4)

## Context
Checkpoints A–D built everything for the GCP VM and wrote `docs/deploy.md`. Checkpoint E is the cutover (ADRs 0075–0078, TRD §8, §10). **Most steps are Naresh's** (cloud console, `gcloud`, Tailscale login, Obsidian login, phone). Claude Code's job is to walk him through the runbook, fix whatever doesn't match reality, run the Mac-side commands he approves, and write the release notes. There is no TDD red→green here except where a runbook fix touches a script (then the script's test is written first).

Rules for the whole checkpoint:
- Claude Code runs no cloud action on its own: no `gcloud` create/delete, no registry push, no `ssh` to the VM, no secret values read or printed. Each such command is shown to Naresh first; he runs it or approves it.
- One task at a time; each stops for Naresh's confirmation ("done / output pasted") before the next.
- Every runbook or script deviation found is fixed in the same task's commit (`docs/deploy.md`, script + its test, `atlas.env.example`), logged in `tasks.md` with what differed.
- Commits as `feat|docs(0.10-7.x): …`, files staged by name, pushed. Plan saved first.

## Before 7.1: save this plan
Copy to `docs/v0.10.0/plans/checkpoint-e.md`, tick the Plan cell in `tasks.md`, commit `docs(0.10-plan): checkpoint E`, push.

## 7.1 GCP resources, secrets, OAuth client (ADRs 0077, 0078)
- Naresh follows `docs/deploy.md` §1 (project, APIs, registry, bucket, service account and per-resource roles, five secrets, firewall, VM) and `google-cloud-setup.md` (OAuth client, **In production**, VM Tailscale origin + redirect URIs — the Tailscale name comes in 7.2, so the OAuth redirect URIs are added/edited after §3).
- Claude Code, per step: shows the exact command, Naresh pastes the output (never secret values); Claude checks it against the runbook and notes mismatches (flag names, role names, prices, image family, whether Google's Debian image has `gcloud`/`unattended-upgrades` — both open from 5.5).
- Fixes land in `docs/deploy.md`; the real project ID, registry host and bucket name go into `deploy/vm/atlas.env.example` comments and `deploy/release.env.example` guidance as examples only (they're not secrets; the real files stay git-ignored / on the VM). If `atlas.env.example` changes, `deploy/vm/fetch-secrets.test.mjs` and `scripts/compose.test.mjs` run again.
- Check before moving on: `gcloud secrets list`, `gcloud artifacts repositories list`, bucket exists, VM is `RUNNING`, IAP SSH works (`gcloud compute ssh --tunnel-through-iap`).
- Commit: `docs(0.10-7.1): runbook fixes from the GCP setup` (or `fix(...)` if a script changed). Tick 7.1, log line.

## 7.2 Bootstrap, Tailscale, sync, first deploy (ADRs 0075–0078)
1. Mac: `brew install shellcheck` if still missing (so the root checks stop skipping); `docker login` to Artifact Registry (runbook §4).
2. Copy the checkout's `deploy/` and Compose files to the VM and run `bootstrap.sh` as root (runbook §2). Confirm: Docker, Tailscale, swap, folders owned by 1000:1000, `atlas.service` enabled, `/etc/atlas/atlas.env` created.
3. `tailscale up --ssh`, disable key expiry, `tailscale serve --bg 3100`; the printed address goes into `/etc/atlas/atlas.env` (`APP_ORIGINS`, `ADMIN_EMAIL`, `REGISTRY`) and the OAuth client's origin/redirect URIs.
4. Mac: Obsidian Sync set up for the vault; on the VM, `ob login` and `sync-setup` for `sync-naresh` per runbook §6 (config volume path verified in 5.2: `/home/node/.config/obsidian-headless`). Obsidian Headless is open beta — any CLI difference from 0.0.14 is recorded.
5. Mac: `deploy/release.sh --dry-run 0.10.0`, then (Naresh approves) the real run → images pushed; VM: `deploy.sh 0.10.0`.
6. **Open checks from earlier tasks, confirmed here and logged:** `docker compose up --wait` with the one-shot `restore` service; Secret Manager `payload.data` is base64 (5.4); Litestream metric labels and sync count on an idle database (4.3); first-deploy restore path with no database and no replica; `/api/health` 200.
7. Done when the Status panel (admin) shows Agent, Transcription, Replication and Vault sync healthy. Anything that fails is diagnosed from `docker compose logs` output Naresh pastes; fixes are test-first if they touch code or scripts.
- Commit: runbook/script fixes only, `fix|docs(0.10-7.2): …`. Tick, log.

## 7.3 Release checks with Naresh (ADRs 0076, 0077)
Run the runbook's "Release checks" list and record each result in the log:
- Sign in on phone and Mac (Google OAuth through the Tailscale origin).
- One video (watch `docker stats --no-stream` during it, TRD §8.5: no OOM kill, swap not pinned; if it fails, the runbook's resize step, not a code change), one article, one feed item → saved notes appear in Obsidian on the Mac.
- A note written on the Mac reaches the VM (linker suggestion or Melete scan sees it).
- A Melete review on the phone.
- A test restore from the bucket into a scratch path (never over `/srv/atlas/data`): `litestream restore` to `/tmp`, open with `sqlite3`, row counts sane.
- The Mac sleeps; the VM keeps working.
- Note YouTube blocking the VM's address if it happens (known issue in TRD §10, deferred: cookies/proxy).
- Commit only if docs change: `docs(0.10-7.3): release check results`. Tick, log with the measured numbers.

## 7.4 Release notes (docs only)
- `docs/v0.10.0/release-notes.md` from TRD §10 (New, Changes, Upgrading, Deferred, Known issues), following `docs/v0.9.0/release-notes.md` for shape; known issues updated with what 7.3 actually found.
- `docs/README.md`: v0.10.0 marked done with a release-notes link (same line shape as v0.9.1).
- README status line; log note of when Naresh shuts down the old GCP project (runbook last section) — Claude never deletes it.
- Commit `docs(0.10-7.4): release notes`. Tick, log.

## Verification
- After each task that touched a script or config: `pnpm test` (includes `deploy/**` and `scripts/**`, shellcheck now live), plus lint and typecheck for any app folder touched (expected none).
- End of checkpoint: `pnpm e2e` (Docker running), the VM's release checks from 7.3, then the checkpoint report: per-task commit hashes, test/lint/typecheck/e2e results, ADRs written (only if a decision changes — e.g. a hosting choice reversed), deferred items.

## Risks / things I'll stop and ask about
- Any change to a decision in ADRs 0075–0078 (region, machine type, sync tool, Litestream) → stop, Naresh decides, next-numbered ADR.
- Anything needing a secret value, a billing action, or deleting the old project: Naresh does it.
- If Obsidian Headless can't log in or sync headlessly, 7.2 stops there and reports; no workaround is built without an ADR.

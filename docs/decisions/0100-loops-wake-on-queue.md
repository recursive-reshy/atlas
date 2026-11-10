# 0100. The worker and the Melete generator wake when work is queued

- Status: Accepted
- Date: 2026-11-10

## Context
The job worker and the Melete generator each poll the database every second, so a job started from the page waits up to a second before anything happens, and an idle server runs two queries a second for nothing.

## Decision
- `worker/wake.ts` is a leaf module with a small emitter (`node:events`, no dependency): `wakeWorker()`, `wakeGenerator()`, and `onWorkerWake( fn )` / `onGeneratorWake( fn )`, each returning an unsubscribe function. A wake is delivered in a microtask, so it never runs inside the caller's database transaction.
- The services call it after they queue work: `queueJob`, `retrySummary`, `regenerateSummary`, `runLinking` and `submitPastedText` wake the worker; enrolling a note, regenerating or retrying its questions, requesting or approving a syllabus, remapping, and pinning a note's concepts by hand wake the generator.
- Each loop runs a pass when woken and still polls every 15 seconds, so work queued by a path that does not wake (a scan, another process, a restart) is found within 15 seconds. A wake that arrives while a pass is running sets a flag, and one more pass runs when the current one ends.
- Unchanged: one pass at a time, restart recovery (`recoverInterruptedJobs`, `requeueGenerating`, `requeueMapping`), and the stop function, which clears the timer, unsubscribes, ignores later wakes and awaits the current pass.

## Consequences
- Follows TRD §5.5; it does not change the TRD.
- A job started from the page begins in the same tick; the idle cost drops from two queries a second to two every 15 seconds.
- A missing wake call is a slower start (up to 15 s), never a lost job.

## Alternatives considered
- **Keep polling at 1 s:** the wait and the idle cost stay.
- **A queue table with notifications:** the loops already claim from the tables; a second source of truth is more than a two-user app needs.

# 0108. Google Calendar is a reviewed time source for Themis

- Status: Accepted
- Date: 2026-11-10

## Context
Themis (1.1, ADR 0091) counts measured Melete time and time logged by hand in Atlas. Time spent away from Atlas (gym, family, side projects) needs a manual log, so most of it isn't recorded. Naresh already uses Google Calendar on his phone.

## Decision
**Connection.**
- A per-user, opt-in, read-only grant from Settings › Sources, separate from sign-in (OIDC only) and from Gmail.
- Scopes: `calendar.calendarlist.readonly` and `calendar.events.readonly`. Falling back to `calendar.readonly` is allowed if the consent screen makes the pair awkward.
- The same OAuth client as Gmail. Naresh enables the Calendar API, adds the scopes and adds the redirect `/api/calendar/oauth/callback` (documented in `docs/google-cloud-setup.md`).
- New dependency: `@googleapis/calendar`.
- `tokenCipher` and the OAuth state store move from `gmail/` to `google/` first, with no change to Gmail; Calendar gets its own `calendar/auth.ts`.
- A `calendar_connection` health check per user. A token that can't be decrypted or is refused marks the connection broken and stops syncing; imported time is kept.

**One dedicated calendar.** The user picks one calendar. Every finished timed event in it is a candidate; nothing outside it is read.

**Manual sync, reviewed drafts.**
- No background polling. A sync runs from **Sync now**, and when Home or the review page opens, skipped if the last sync was under 5 minutes ago.
- A sync re-reads the window from `max( import_from, now − CALENDAR_LOOKBACK_DAYS )` (default 14) to now, with recurring events expanded. It then creates, updates or deletes **draft** rows to match.
- Reconciling runs only after a complete read; a failed read deletes nothing.
- Skipped: all-day events, and events that have not ended. An event counts on the day it started (`APP_TIME_ZONE`, same rule as other time entries). Overlapping or long events count in full.
- Drafts are pre-assigned by **title rules**: phrase contained (case-insensitive) → one goal or subject, ordered, first match wins. Changing rules reapplies them to drafts that are unassigned or rule-assigned; hand assignments stay.
- The user can edit a draft's assignment, times and note, then **approve**, **approve all matched**, or **dismiss**. A draft without a goal or subject cannot be approved.
- An approved draft becomes an ordinary `time_entries` row with source `calendar`, owned by Atlas: editable in Atlas, not changed by later calendar edits.
- Approved and dismissed events stay as markers so a re-sync never imports them again, even after the time entry is deleted.

**No double counting with Melete.**
- At approval, the event's window is compared with measured entries in the assigned subject, or in any subject linked to the assigned goal. The covered seconds are subtracted, and the draft shows the split ("60 min · 25 already measured · counts 35").
- A fully covered draft records nothing on approval.
- The result is computed once and stored; a measured session that grows later doesn't change it.

**Storage (migration 19).**
- `time_entries` rebuilt with source `measured | logged | calendar`; calendar entries may point at a goal or a subject.
- `calendar_account` mirrors `gmail_account`, plus the calendar id and name, `import_from` and `last_synced_at`.
- `calendar_rules`.
- `calendar_events`: one row per event, with status `draft | approved | dismissed`, unique per user, calendar and event.
- Disconnect keeps approved entries and markers. "Remove imported time" deletes them.
- Titles are never logged (ADR 0049).

## Consequences
- Nothing from the calendar counts until reviewed, so numbers lag until a sync and review; Home shows drafts waiting.
- No poller, no Google calls the user didn't trigger.
- Edits to a calendar event older than the lookback window aren't seen; edits after approval are ignored by design.

## Alternatives considered
- **Read the main calendar with filters:** appointments leak in, and filtering logic can be wrong.
- **Background polling and automatic counting:** numbers without review, plus following edits and deletions of counted entries forever.
- **Google incremental sync tokens:** cheaper on paper, but they can't be combined with a time window, they expire and force a full resync, and cancellations need separate handling. Re-reading a dedicated calendar's 14 days is trivial.
- **Claude matching events to goals:** KIV; rules first.
- **Warning about overlaps instead of subtracting:** leaves double counting in the numbers.

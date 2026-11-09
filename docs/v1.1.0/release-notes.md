# Atlas v1.1.0 — Release notes

v1.1.0 is the first feature release after 1.0. Melete learns what a subject should cover and how much of it you know, and a new module, Themis, ties study and other time to the goals it is for. Mnemosyne (the transcriber) does not change. The database moves from schema 14 to 16 with all data kept.

## New
- **Melete: target level and syllabus** (ADR 0089). A subject gets a target level (Awareness, Working knowledge, Proficient, Expert) and an optional intent. Claude drafts a syllabus of concepts in sections; you rename, add, remove and reorder them, then approve it, or ask for a redraft. The syllabus lives in the database, not the vault.
- **Melete: notes mapped to concepts** (ADR 0089). When an enrolled note is new or changed, Claude maps it to concepts and labels each question with one; a note that fits none is flagged off-syllabus, where you can map it by hand, add a concept for it or dismiss the flag. A hand mapping is kept until the note's content changes. Mapping runs in the background, failures show on the note with a retry, and work cut off by a restart is picked up again. **Remap all** is on the Syllabus tab.
- **Melete: coverage, mastery and the gap view** (ADR 0090). Coverage is the share of concepts with a mapped note; mastery is the mean over all concepts of a question score of `min(1, stability / 21 days)` (the 21 is a setting), so it never passes coverage. The Overview tab groups concepts as uncovered, weak and solid, leads with a next step and offers **Review** for a concept. No Claude call computes either number.
- **Melete: suggest resources** (ADR 0093). For a concept you haven't covered, Claude suggests 3–5 resources from its own knowledge: what it is, who by, why it fits, and a search query. There are no links, so none can be broken or invented; each suggestion opens a web or YouTube search. Nothing is stored.
- **Melete landing page.** A card per subject with level, coverage, mastery, cards due today and time this week, above **Review all due**.
- **Time** (ADR 0091). Time in a review is measured from the answers already saved: answers less than 5 minutes apart are one session, timed from the first to the last plus 30 seconds for the final card (both are settings). You can also log minutes against a subject or a goal, on a day up to a year back, and edit or delete them. The shared **Log time** dialog opens from Themis and from a subject, and works on a phone.
- **Themis** (ADRs 0092, 0095). A module you switch on per user: your own areas, goals under them (active, achieved or dropped), and for each goal one outcome fixed at creation: learning (coverage and mastery of its linked subjects), a metric with a unit and target that you update by hand, or a weekly or monthly check-in rated 1–5. Subjects link to goals, so their time and mastery flow in. The home shows check-ins due (answered in place), time per area for a week, month or quarter, and goal cards; **All goals** lists the achieved and dropped ones.
- **Themis is first in the drawer**, so a user who has it lands there.
- **New settings and prompts.** Settings → Prompts has Melete syllabus, Melete mapping and Melete suggestions; Settings → Models has a model for each, and the mastery days, the session gap (1–30 minutes) and the final-card credit (0–120 seconds). Usage counts every new call, in its own categories.
- **Migrations 15 and 16** (ADR 0085), locked with invented-data seeds and upgrade tests: 15 is the concept layer, 16 is Themis, time and the wider `user_modules` check.

## Changes
- **A new route, `GET /api/themis/goals`** (ADR 0095), for the All goals list; the TRD had the list but no route that could feed it.
- **`melete_note_concepts` carries a `user_id`** (ADR 0094), as the schema guard requires.
- Melete's Today page is now subject cards, and its button is **Review all due** (it was Start review). A subject's page is four tabs, and its enrolment controls are under Settings and Notes.
- Members start without Themis; the admin has every module, and switches Themis on for a member in Settings → Admin.

## Upgrading from 1.0.0
`sudo /opt/atlas/deploy.sh 1.1.0` is enough. The database goes from schema 14 to 16 and a copy goes to `pre-migration/`; `--restore-pre-migration` rolls back past both migrations ([Rolling back](../deploy.md#rolling-back)). Nothing needs a backfill: there were no subjects with a syllabus, existing subjects read back as having none, and existing notes as not needing mapping. A subject without an approved syllabus works exactly as before.

## Deferred
- Metis writing financial metrics into Themis goals; metric goals are where it will write.
- A stored, curated resource list per subject, and tracking which suggestions you used.
- Check-in reminders by push or email; check-ins show in Themis only.
- Other modules feeding Themis time.
- Reading notes in Melete is not measured; log it by hand.

## Known issues
- A hand edit, or a concept added, while Map is running on that note can be overwritten by that run's result.
- Relinking a subject moves its past time to the new goal.
- Logging time between midnight and the study-day start hour: the dialog offers the calendar day, which the server may refuse as being in the future; its message is shown and the previous day works.
- Only public YouTube videos work; a very long video may be cut short (the transcript is kept and marked).
- Obsidian Headless is in open beta.

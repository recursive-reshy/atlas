# Atlas v1.1.0 — Product Requirements

## 1. Summary
v1.1.0 is the first feature release after 1.0. It does two things that build on each other:
- **Melete gets a concept layer.** Each subject gets a **target proficiency**. Claude drafts a syllabus of concepts, maps each note to them, and the subject shows **coverage** (how much of the syllabus your notes reach) and **mastery** (how well you retain it). A gap view says what to study next and can suggest resources for concepts you haven't covered.
- **Themis, a new module for life goals.** You set areas (Career, Financial, Relationships…), goals under them, and track each goal through the **time** you spend on it and one **outcome** signal. Melete subjects link to goals, so study time and mastery flow into Themis without extra work.

Mnemosyne (the transcriber) doesn't change.

## 2. Background
Melete (0.8) treats each subfolder of the learning root as a subject, generates questions per enrolled note and schedules them with FSRS. It knows what you review, but not what a subject should cover, so it can't say how far through it you are or what's missing. Nothing in Atlas yet connects study to what it's for.

Decided while scoping (2026-11-07):
- A subject stays one folder under the learning root, and keeps the name "subject" in the UI and in code (no rename). There are no existing subjects on the VM, so nothing needs a syllabus backfill.
- Syllabus: Claude drafts it up front from the subject name, target level and intent; you edit and approve it. New notes are mapped to concepts; a note that fits none is flagged.
- Subject cards show both coverage and mastery. The gap view groups concepts as uncovered, weak and solid.
- Time spent = active time in Melete plus manual logs. No automatic credit for video length or article reading time.
- Subjects link to goals (many subjects to one goal); goals sit under areas.
- Goal outcome types: learning (from linked subjects), manual metric with a target, or periodic check-in. Time can be logged directly against a goal.
- Resource suggestions are light: on demand for an uncovered concept, nothing stored as a catalogue.
- 1.1 is the first release under ADR 0084: every schema change is a forward-only migration with a seed fixture.

## 3. Goals
- Each subject shows how much of what you set out to learn you have covered and how much you retain.
- Melete tells you what to study next, and where to find material for a gap.
- You can see where your time goes across life areas, measured or logged, not guessed.
- Each goal shows honest progress: a number where one exists, a check-in where it doesn't.
- The VM upgrades from 1.0 to 1.1 with all data kept.

## 4. Non-goals
- **No automatic time from content.** Watching a video or reading an article in Mnemosyne credits no time.
- **No stored resource catalogue** and no web search; suggestions come from Claude's own knowledge when asked.
- **No Metis link.** Financial goals use manual metrics until Metis exists.
- **No notifications** (push or email) for check-ins; they show in Themis.
- **No sharing** of goals or subjects between users; the admin still sees usage and cost totals only.
- No change to how Mnemosyne summarizes, links or saves notes, or to how FSRS schedules a question.

## 5. User flows
1. **New subject.** In Melete, Naresh creates "Data Engineering": picks or creates its folder under the learning root, sets the target level (Awareness, Working knowledge, Proficient, Expert) and an optional intent ("pass the GCP Data Engineer exam"), and optionally links it to a Themis goal. Claude drafts a syllabus; he renames, removes, adds and reorders concepts, then approves it.
2. **Studying.** Notes land in the folder (from Mnemosyne or written in Obsidian). When a note is enrolled, Claude maps it to concepts; an off-syllabus note is flagged on the subject, where he can map it by hand, add a concept for it, or dismiss the flag. Questions are generated and reviewed as today. Time in Melete counts against the subject automatically.
3. **Choosing what's next.** The subject's gap view lists uncovered concepts (with a **Suggest resources** button), weak concepts (with **Review** or **Quiz**), and solid ones.
4. **Melete landing.** The page lists his subjects as cards with coverage and mastery. Flashcards, the gap view, syllabus and settings live inside each subject.
5. **Setting goals.** In Themis he creates areas, then goals under them: "Move into a data engineering role" (Career, learning outcome, linked to two subjects), "Emergency fund 30k" (Financial, manual metric), "Time with family" (Relationships, weekly check-in).
6. **Logging time.** From a phone, he taps **Log time**, picks a subject or goal, enters minutes and an optional note.
7. **Themis home.** He sees check-ins due, a chart of time per area for this week, month or quarter (measured vs logged), and goal cards with their progress.

## 6. Features

### 6.1 Subjects
As a learner, I want each subject to have a target.
- [ ] A subject stays one folder under the learning root, 1:1, and keeps its name everywhere. Existing behaviour (enrolment, auto-enrol, new cards per day) carries over.
- [ ] A subject has a name, a target level on a fixed four-step scale, an optional free-text intent, and an optional link to one Themis goal.
- [ ] Creating a subject can create its folder under the learning root or use an existing one.
- [ ] A subject whose syllabus isn't approved yet works as a subject does today; coverage and mastery show "Set up syllabus".

### 6.2 Syllabus
As a learner, I want a list of what the subject should cover, drafted for me.
- [ ] Claude drafts a syllabus from the subject name, target level, intent, and any notes already in the folder.
- [ ] A syllabus is an ordered list of concepts, each with a name and a one-line description. Concepts are grouped into sections (two levels only; a small syllabus can be one section).
- [ ] Before approval and at any time after, he can rename, describe, add, remove and reorder concepts, or ask Claude to redraft.
- [ ] Removing a concept removes its mappings; the affected notes are rechecked for a fit (TRD decides how).
- [ ] The syllabus lives in the database; it isn't written to the vault.
- [ ] Each draft is a Claude call recorded with tokens and cost, like other runs.

### 6.3 Note-to-concept mapping
As a learner, I want my notes counted against the syllabus without tagging them myself.
- [ ] When an enrolled note is new or its content changes, Claude maps it to one or more concepts.
- [ ] A note that fits no concept is flagged as **off-syllabus** on the subject. He can map it by hand, add a concept for it (from Claude's suggested name), or dismiss the flag.
- [ ] Each question is labelled with one of its note's concepts, so it counts towards exactly one concept. Remapping a note without a content change relabels its questions and keeps their FSRS state.
- [ ] He can see and change any note's concepts from the subject. A hand-set mapping is kept by automatic remaps until the note's content changes.
- [ ] Mapping runs in the background like question generation; a failed call shows on the note and can be retried, and work interrupted by a restart is picked up again.

### 6.4 Coverage and mastery
As a learner, I want two honest numbers per subject.
- [ ] **Coverage:** the share of syllabus concepts with at least one mapped enrolled note.
- [ ] **Mastery:** a question scores 0 until reviewed, then `min(1, stability / 21 days)` (the 21 days is a setting). A concept's mastery is the mean of its questions; under 0.7 is weak, 0.7 and over is solid. A subject's mastery is the mean over all syllabus concepts, uncovered ones counting 0, so it never exceeds coverage.
- [ ] Both show on the subject card and in the subject, with per-concept values in the gap view.
- [ ] Neither number needs a Claude call to compute.

### 6.5 Gap view and resource suggestions
As a learner, I want to know what to study next.
- [ ] Concepts are grouped as **uncovered** (no notes), **weak** (notes, low mastery) and **solid**.
- [ ] The view leads with a short "next step": the first uncovered concept in syllabus order, or the weakest concept if all are covered.
- [ ] Weak concepts offer a review of their questions.
- [ ] Uncovered concepts offer **Suggest resources**: Claude suggests 3–5 resources from its own knowledge (no web search): what it is (book, official docs, course, talk…), who it's by, why it fits this concept and level, and a search query. No URLs are generated, so none can be broken or invented.
- [ ] Each suggestion's search query opens as a web or YouTube search; Naresh finds the link himself and can paste it into Mnemosyne as usual.
- [ ] Suggestions are shown, not stored.

### 6.6 Melete landing page
- [ ] Melete opens on a list of subjects as cards: name, target level, coverage, mastery, cards due today, time this week.
- [ ] Today's review queue across all subjects stays one tap away.
- [ ] The phone-first layout from 0.8 is kept.

### 6.7 Time tracking
As a user, I want my time counted honestly.
- [ ] **Measured time:** time spent reviewing and quizzing in a subject counts against it, worked out from the answers already saved: answers less than 5 minutes apart form one session, timed from the first answer to the last plus 30 seconds for the final card (both settings). Reading notes in Obsidian is logged by hand.
- [ ] **Logged time:** he can log minutes against a subject or a goal, with a date and an optional note, and edit or delete his entries.
- [ ] Every time entry records its source (measured or logged).
- [ ] **Log time** is reachable from Melete and Themis and works well on a phone.

### 6.8 Themis: areas and goals
As a user, I want my life goals in one place.
- [ ] Themis is a module the admin can switch on per user, like Mnemosyne and Melete.
- [ ] Areas are his own list (name, order); none are built in.
- [ ] A goal belongs to one area and has a name, an optional target date, a status (active, achieved, dropped) and one outcome type (§6.9).
- [ ] Subjects link to goals, many to one. A goal's time is its linked subjects' time plus time logged against the goal itself; an area's time is the sum of its goals'.
- [ ] Achieved and dropped goals leave the home view but keep their history.

### 6.9 Goal outcomes
- [ ] **Learning:** combined coverage and mastery of the goal's linked subjects.
- [ ] **Metric:** a number with a unit and a target that he updates by hand; each update is kept so the card can show a trend. Built so a later module (Metis) can write updates.
- [ ] **Check-in:** on a weekly or monthly cadence he rates the goal 1–5 with an optional note; the trend is the signal.

### 6.10 Themis home
- [ ] **Check-ins due** at the top, answerable in place.
- [ ] **Where your time went:** time per area for week, month or quarter, split into measured and logged.
- [ ] **Goal cards** grouped by area: name, target date, time this period, outcome (progress bar, metric vs target, or check-in trend), linked subjects.
- [ ] **Log time** always in view.

### 6.11 Admin and usage
- [ ] The admin's module toggles include Themis.
- [ ] Syllabus drafts, note mapping and resource suggestions are recorded in usage with their own categories, so per-user totals stay complete.

## 7. Constraints
- **Data first (ADRs 0084, 0085):** every schema change is a new locked migration with a seed fixture and an upgrade test. Nothing resets the VM's database.
- **Vault:** Melete and Themis still never write to the vault; the review save stays the only vault write.
- **Dependencies:** only those named in the TRD.
- **Tests:** no test touches the network, Claude, Gemini or a real vault; the e2e smoke test runs against fakes and gains a Melete subject and a Themis goal path.
- **Logs:** paths and IDs only, never note text, goal names or check-in notes (ADR 0049).
- **Release branch:** work happens on `release/1.1.0`; Naresh merges and tags.

## 8. Out of scope (KIV)
- Metis writing financial metrics into Themis goals.
- A stored, curated resource list per subject; tracking which suggestions he used.
- Check-in reminders by push or email.
- Other modules feeding Themis time (e.g. a jobs CRM).
- Metis, job-alert intake (ADR 0041), the jobs CRM, the business-idea validator.

## 9. Open questions
None. Settled in the TRD (ADRs 0089–0093), 2026-11-07:
1. ~~Naming in code~~ — settled: "subject" everywhere, no rename.
2. ~~Syllabus shape~~ — settled: sections of concepts, two levels; rough sizes Awareness 8–12, Working knowledge 15–25, Proficient 25–40, Expert 40–60; hard cap ~80.
3. ~~Mastery formula~~ — settled: stability-based (§6.4), questions labelled per concept (§6.3).
4. ~~Remapping~~ — settled: content change remaps the note; added concept rechecks off-syllabus notes; removed concept remaps notes left with none; redraft remaps all; a Remap all button; hand mappings stick.
5. ~~Where the Claude calls run~~ — settled: all in Express; Draft syllabus (Sonnet), Generate extended with concepts and labels (Haiku), Map (Haiku), Suggest resources (Sonnet); each with locked instructions, editable guidance and a model setting; recorded in `melete_runs`.
6. ~~Resource suggestions~~ — settled: Claude's own knowledge, no web search, no URLs (names, reasons and search queries), not stored.
7. ~~Measured time~~ — settled: derived from saved answers (sessions with a 5-minute gap cutoff, 30-second final-card credit), stored with logged time in one table.
8. ~~Periods and time zone~~ — settled: app-wide `APP_TIME_ZONE` and Melete's day start hour; weeks Monday–Sunday, calendar months and quarters; weekly check-ins due Monday, monthly on the 1st, missed ones don't pile up; logged time can be back-dated.
9. ~~Module toggle~~ — settled: `themis` added to `ModuleId`; migration 16 rebuilds `user_modules`; members start without it.
10. ~~Navigation~~ — settled: drawer order Themis, Mnemosyne, Melete; users with Themis land on it.

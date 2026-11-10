# 0102. The job list omits the draft

- Status: Accepted
- Date: 2026-11-10

`GET /api/jobs` returns `JobListItem`, which is `Job` without `note_markdown`; `GET /api/jobs/:id` and every other job response still return the full `Job` with the draft. The list query no longer reads the transcript or the draft (task 4.2), and returning `note_markdown: null` for a job that has a draft would say "no draft", which `null` means everywhere else, so the field is left out of the list's type and its response instead. The web's list (`useJobs`, `listJobs`) is typed with `JobListItem`. This changes the shared contract and the response of one endpoint; Naresh approved it (v1.1.1 task 4.7). It does not change the TRD, which says the list leaves the draft out (5.2).

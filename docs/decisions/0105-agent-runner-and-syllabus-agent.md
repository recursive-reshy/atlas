# 0105. A shared agent runner, and syllabus drafting as the second agent

- Status: Accepted
- Date: 2026-11-10

## Context
By ADR 0103, Melete's syllabus draft is an agent. The linker's loop (`linker/loop.py`) holds the parts any agent needs: turn and tool-call limits, the timeout, token accounting, the nudge after a reply without tools, one retry after an invalid submission, and prompt caching. Only its instructions, first message, tools, submit model and `apply_checks` are specific to linking.

## Decision
**Runner (`atlas_agent/runner.py`).**
- `run_agent( spec, claude )` takes an `AgentSpec`: system text, first user message, model, tools (definition and handler), submit tool name and Pydantic submit model, and `Limits` (turns, tool calls, output tokens, timeout).
- It returns a typed result: outcome `SUBMITTED` with the validated submission, or `FAILED` with a reason, plus usage. Endpoint-specific post-checks and responses stay in each endpoint.
- The linker's loop behaviour moves over unchanged: the nudge and failing on the second reply without tools, one retry on an invalid submission, the limit and timeout messages, cache control on the system text and tools.
- **New: a moving cache breakpoint.** Each turn marks the latest user message (tool results) for caching, so earlier turns are billed as cache reads. Only the cost changes.
- The linker is refactored onto the runner first, with no behaviour change; `tests/linker/test_loop.py` passes apart from imports.

**Vault toolset.** `vault_tools( root, settings, include )` builds `list_notes`, `search_vault`, `read_note` and `list_link_targets` against a root folder, using the existing path-safety code. The linker passes the user's vault and all four tools. The syllabus agent passes the subject folder and the first three tools, so it cannot read outside the subject.

**Syllabus agent (`POST /v1/syllabus`).**
- Request: `vault_dir`, `subject_folder` (relative to the vault), `name`, `level`, `intent`, `model`, `guidance`.
- Response: a union on `outcome`, either `drafted` with `sections` (name, concepts with name and description) or `failed` with `reason`, plus `AgentUsage`.
- Locked instructions move from Express (`LOCKED_INSTRUCTIONS_MELETE_SYLLABUS`) into the agent, with the size rules unchanged, plus how to read: list first, open the notes that look central, don't read everything for the sake of it, and draft from name, level and intent when the folder is empty. They are served at `GET /v1/syllabus/instructions`.
- Limits in agent config (`SYLLABUS_*`): 16 turns, 40 tool calls, 8192 output tokens, 180 s. `read_note_chars` stays shared.
- **`AgentUsage`** replaces `LinkUsage` in the contract for both responses, with the same fields on the wire.

**Express.**
- `draftForSubject` calls the agent instead of Claude. `processSyllabus` (trim, dedupe, 80 cap, no empty section) runs on the agent's output; storing, the diff and remapping are unchanged.
- Removed: `MAX_SYLLABUS_NOTES`, `NOTE_OPENING_CHARACTERS`, `noteOpening`, `readNotes`, `buildSyllabusUser`, the `draftSyllabus` Claude call and the Express locked syllabus text.
- No fallback: an agent failure or an unreachable agent sets `syllabus_status = 'failed'` with the reason ("Agent service unavailable" when unreachable). The old syllabus is kept and the existing retry applies.
- `AGENT_SYLLABUS_TIMEOUT_MS` (default 200 000) is above the agent's own 180 s, so the agent reports its own timeout.
- Runs stay in `melete_runs` (kind `syllabus`), which gains nullable `turns` and `tool_calls` (migration 18). `link_runs` is unchanged.
- Settings shows the syllabus's locked instructions from the agent, as it does for the linker. Guidance stays in the `melete_syllabus` prompt profile; the model stays `melete_syllabus_model` (Sonnet).

## Consequences
- A draft reflects what the notes say, at a higher cost per draft (several turns, more input), reduced by the moving cache breakpoint. Drafts are rare.
- Drafting needs the agent container up. The Status panel already shows when it is down.
- The third agent is instructions, tools and a submit model.

## Alternatives considered
- **Keep drafting in Express and raise the caps:** still Express guessing what matters, and a larger prompt every time.
- **A generic agent-run table replacing `link_runs`:** a migration on released data for no gain.
- **Fall back to the old path when the agent is down:** two code paths to keep, and a quietly worse draft.

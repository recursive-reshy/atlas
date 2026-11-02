# CLAUDE.md — apps/agent

The Mnemosyne vault agent service: a stateless Python 3.14 / FastAPI service that reads the Obsidian vaults (read-only) and runs Claude tool-use agents for the Express server. Its first endpoint, `POST /v1/link`, proposes wikilinks for a new note. The root `CLAUDE.md` covers the workflow, git and what applies to the whole repo; this file adds only what is specific to this service.

## Specs

The TRD sections this service needs (`docs/v0.7.0/trd.md`):

- Scaffold, tooling, layout: §2.1
- Config and limits: §2.2
- App, auth, health, logging: §2.3
- Vault tools: §2.4
- The Claude boundary: §2.5
- The linker loop and locked instructions: §2.6
- Post-checks on suggestions: §2.7
- Endpoints: §2.8
- The contract, its export and examples: §3 (ADR 0043)
- Docker: §8
- Tests: §9

## Hard boundaries

- **No state.** The service never writes to disk, and never adds caches or module-level mutable globals. Settings are read once in `create_app()` and passed down.
- **The vaults are read-only.** Never write, move, rename or delete anything under `VAULTS_ROOT`, in code or in tests. A request names its vault by `vault_dir` (ADR 0063); `vault_for( settings, vault_dir )` in `vault/paths.py` resolves it to a real folder directly inside `VAULTS_ROOT` (not a symlink, not outside the root) or raises `UnknownVaultError`, which the route answers with 422 `{ "error": "unknown_vault" }`. Every path a tool opens then goes through `vault/paths.py` and must stay inside that vault's root, so a run can never see another user's vault. Tests keep the fixture vault in a temporary `VAULTS_ROOT` as `vault` (the `vault_copy`, `vault_dir` and `settings` fixtures). Tests use `tests/fixtures/vault/`, copied to a temporary directory when a test needs to change it; never a real vault.
- **Change `src/mnemosyne_agent/contract/` only when a task says to.** In the same commit: rerun `uv run python -m mnemosyne_agent.contract.export`, commit the regenerated `schema/link_contract.json`, update `schema/examples/`, and update the Zod mirror in `packages/shared/src/agent.ts` (ADR 0043).
- **No model choice.** The model comes in the request. Never hardcode or default a model name.
- **One response shape.** Once authorized, `/v1/link` answers HTTP 200 with a `LinkResponse`. A bad request (including a `vault_dir` that isn't a valid folder name) or any agent failure is `outcome: failed` with a reason, never FastAPI's default 422. Only a missing or wrong secret is a 401, and the one deliberate 422 is a well-formed `vault_dir` that names no vault (TRD §7.3, ADR 0063).
- **The locked instructions (`linker/instructions.py`) are Naresh's prompt text.** Change them only when a task says to. The editable guidance lives in the server's database and arrives in the request.
- **Logs are JSON** (`logging_setup.py`: `JsonFormatter`, `configure_logging( level )`, the `job_id_var` filled from the `X-Job-Id` header when it is a UUID). Put variable parts in `extra`, not only in the message. `LOG_LEVEL` uses the server's names (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`).
- **Never log** the note body, the guidance, `AGENT_SECRET` or `ANTHROPIC_API_KEY`.
- **Dependencies** named in the TRD are added with `uv add` (or `uv add --dev`), never by editing `pyproject.toml` by hand. Never run `uv init` or recreate the scaffold.

## Commands

```
uv sync
uv run pytest
uv run pyright
uv run ruff check
uv run pytest -m docker
uv run python -m mnemosyne_agent.contract.export
```

`pnpm --filter @atlas/agent test|lint|typecheck` runs the first three through `package.json`, and the root `pnpm test|lint|typecheck` includes them. All three must pass before a task is ticked. Never run `ruff format`, `black`, `yapf` or `isort`: they destroy the house style below. Run `ruff check` without `--fix` and fix findings by hand. Never enable Ruff's import-sorting rules (`I`), the pycodestyle whitespace and blank-line rules (`E1`, `E2`, `E3`, `W`) or the trailing-comma rules (`COM`) in `pyproject.toml`; they contradict the house style.

## Code style

There is no formatter. You are the formatter. Follow these rules exactly, and match the reference example at the end.

### Spacing

- Spaces inside all non-empty brackets: parentheses, square brackets and braces.
  - Calls and definitions: `search_vault( query )`, `def read_note( path: str ) -> NoteContent:`
  - Class bases and decorators: `class LinkOutcome( StrEnum ):`, `@app.post( "/v1/link" )`
  - Types and subscripts: `list[ str ]`, `dict[ str, int ]`, `hits[ 0 ]`
  - Literals: `[ 1, 2, 3 ]`, `{ "key": value }`
- Empty brackets stay tight: `list_notes()`, `[]`, `{}`.
- f-string replacement fields stay tight: `f"{elapsed:.1f}"`.
- Spaces around `=` in keyword arguments and defaults: `limit = limit`, `def search( query: str, limit: int = 20 )`.

### Layout

- **One** blank line between top-level definitions, and after the import block.
- When a call or signature doesn't fit on one line, put one argument per line and the closing bracket on its own line.
- No trailing comma after the last argument or element.
- Long strings use implicit concatenation inside parentheses:

  ```python
  reason = (
      f"Stopped after {tool_calls} tool calls "
      f"(limit {settings.max_tool_calls})"
  )
  ```

- Double quotes. f-strings for all interpolation.

### Imports

- Absolute imports only: `from mnemosyne_agent.vault.search import search_vault`.
- Three groups separated by one blank line: standard library, third-party, local.

## Code rules

- **Meaningful names.** Names say what the value is: `suggestion`, `reason`, `exception`. No single letters (except `_`), no abbreviations beyond universal ones (`id`, `url`, `http`). Booleans read as questions: `is_stale`, `has_note`.
- **No unnecessary abstractions.** No base classes, factories, registries or helper modules for something used once. Add an abstraction only when there are already two real uses and the task calls for it. The one planned boundary is `claude.py` (TRD §2.5).
- **Inline when it can be inline.** Logic used in one place stays in that place; don't extract a function to give it a name. Name intermediate *values* when they are steps in the flow (`notes = list_notes( root )` then `targets = list_link_targets( root )`), not to wrap a single expression.
- **Guard clauses first, happy path last.** Return early on each failure. The success path is at the bottom and not nested.
- **Expected failures are values, not exceptions.** Catch at the boundary and return a typed result with a `StrEnum` outcome and a human-readable reason that includes the actual numbers. Raise only for programmer errors.
- **Pydantic models for every structured value** that crosses a function boundary. Optional fields are `X | None = None`, except in `contract/`, where every key is required (including those that may be null), as TRD §3.1 says.
- **Thresholds and limits come from `settings`**, never literals in code.
- **Full type hints**, modern syntax (`X | None`, `list[ str ]`). Pyright runs in strict mode.
- **No docstrings, no comments** that restate the code. A comment is allowed only to explain *why* something non-obvious is done.

## Workflow: test-driven

Every change follows red, green, refactor. No exceptions for "small" changes.

1. **Red.** Write the tests for the behaviour first. Run `uv run pytest` and show that the new tests fail, and fail for the right reason (an assertion or a missing name, not a typo or import error).
2. **Green.** Write the least code that makes them pass. Nothing the tests don't ask for.
3. **Refactor.** Clean up with all tests passing, then run pytest, pyright and ruff again.

Rules:

- Never write implementation code before its failing test has been run.
- Never change or delete an existing test to make code pass. If a test looks wrong, stop and say why.
- One behaviour at a time: one red-green-refactor cycle per test case in the approved plan, not all tests up front.
- Tests never call the Claude API. Use the scripted fake at the `claude.py` boundary.
- If a behaviour can't be tested as specified, stop and say so instead of skipping the test.

## Tests

- Tests mirror `src/` under `tests/` (`tests/vault/test_search.py`, `tests/linker/test_loop.py`), plus `tests/contract/` for the export and examples.
- Routes are tested through `create_app( settings, fake_claude )` with FastAPI's `TestClient`. Never start a real server in a test.
- Every `LinkOutcome.FAILED` path has a test that checks its reason text, including the numbers.
- Docker checks are marked `docker` and run with `uv run pytest -m docker`; the normal run excludes them.
- `tests/contract` regenerates the JSON Schema export and fails if it differs from the committed file, and validates every golden example.
- Tests follow the same style rules as the code.

## Reference example

This shows the house style. Match it.

```python
from enum import StrEnum

from pydantic import BaseModel

from mnemosyne_agent.config import Settings
from mnemosyne_agent.vault.links import LinkTarget
from mnemosyne_agent.vault.notes import NoteSummary

class SuggestionKind( StrEnum ):
    EXISTING_NOTE = "existing_note"
    EXISTING_CONCEPT = "existing_concept"
    NEW_CONCEPT = "new_concept"

class CheckedSuggestion( BaseModel ):
    target: str
    kind: SuggestionKind
    anchor: str | None = None
    reason: str

def classify_target(
    target: str,
    notes: list[ NoteSummary ],
    link_targets: list[ LinkTarget ]
) -> tuple[ str, SuggestionKind ]:
    wanted = target.casefold()
    note = next( ( note for note in notes if note.title.casefold() == wanted ), None )

    if note is not None:
        return note.title, SuggestionKind.EXISTING_NOTE

    existing = next( ( link for link in link_targets if link.target.casefold() == wanted ), None )

    if existing is not None:
        return existing.target, SuggestionKind.EXISTING_CONCEPT

    return target, SuggestionKind.NEW_CONCEPT

def limit_suggestions(
    suggestions: list[ CheckedSuggestion ],
    settings: Settings
) -> list[ CheckedSuggestion ]:
    if len( suggestions ) <= settings.max_suggestions:
        return suggestions

    return suggestions[ : settings.max_suggestions ]
```

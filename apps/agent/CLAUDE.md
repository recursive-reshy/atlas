# apps/agent

Stateless Python 3.14 / FastAPI service that reads the Obsidian vaults (read-only) and runs Claude tool-use agents for the Express server. `POST /v1/link` proposes wikilinks for a new note (ADRs 0042, 0043); `POST /v1/syllabus` drafts a Melete syllabus by reading one subject folder (ADR 0105). Both run on the shared runner (`runner.py`) and the vault toolset (`vault/toolset.py`). The root `CLAUDE.md` covers workflow and git. The original design is `docs/v0.7.0/trd.md` §2–3; the code is the truth for today.

## Hard boundaries

- **No state.** Never write to disk; no caches or module-level mutable globals. Settings are read once in `create_app()` and passed down.
- **Vaults are read-only**, in code and in tests. A request names its vault by `vault_dir`; `vault_for( settings, vault_dir )` in `vault/paths.py` resolves it to a real folder directly inside `VAULTS_ROOT` (no symlink, nothing outside) or raises `UnknownVaultError` (422 `{ "error": "unknown_vault" }`). Every path a tool opens goes through `vault/paths.py` and stays inside that vault. Tests use `tests/fixtures/vault/` copied to a temporary `VAULTS_ROOT`; never a real vault.
- **The contract (`src/atlas_agent/contract/`) changes only when a task says so**, in one commit with: `uv run python -m atlas_agent.contract.export`, the regenerated `schema/link_contract.json` and `schema/syllabus_contract.json`, `schema/examples/`, and the Zod mirror `packages/shared/src/agent.generated.ts`, which `pnpm --filter @atlas/shared generate:agent` writes (never edit it by hand; ADR 0104).
- **No model choice.** The model comes in the request; never hardcode or default one.
- **One response shape.** Authorized `/v1/link` answers 200 with a `LinkResponse` and `/v1/syllabus` with a `SyllabusResponse`; a bad request or any agent failure is `outcome: failed` with a reason, never FastAPI's default 422. Only a missing or wrong secret is 401; the one 422 is a well-formed `vault_dir` naming no vault.
- **`linker/instructions.py` and `syllabus/instructions.py` are Naresh's locked prompts**; change them only when a task says to. The syllabus agent's tools are rooted at the subject folder, so it cannot read outside it. Editable guidance arrives in the request.
- **Logs are JSON** (`logging_setup.py`); variable parts go in `extra`. Never log the note body, the guidance, `AGENT_SECRET` or `ANTHROPIC_API_KEY`.
- **Dependencies** are added with `uv add` / `uv add --dev`, never by editing `pyproject.toml` by hand, and only when the TRD or an ADR names them. Never `uv init`.

## Commands

`uv sync` · `uv run pytest` · `uv run pyright` · `uv run ruff check` · `uv run pytest -m docker` · `uv run python -m atlas_agent.contract.export`

`pnpm --filter @atlas/agent test|lint|typecheck` wraps the first three and the root `pnpm` scripts include them. Never run `ruff format`, `black`, `yapf` or `isort`, never `ruff check --fix`, and never enable Ruff's `I`, `E1`, `E2`, `E3`, `W` or `COM` rules: they destroy the house style.

## Style

There is no formatter; you are the formatter. Match the example at the end.

- Spaces inside every non-empty bracket: `search_vault( query )`, `list[ str ]`, `hits[ 0 ]`, `{ "key": value }`, `class LinkOutcome( StrEnum ):`, `@app.post( "/v1/link" )`. Empty brackets tight. f-string fields tight: `f"{elapsed:.1f}"`. Spaces around `=` in keyword arguments and defaults.
- One blank line between top-level definitions and after imports. When a call or signature overflows, one argument per line, closing bracket on its own line, **no trailing comma**. Long strings use implicit concatenation in parentheses.
- Double quotes; f-strings for all interpolation. Absolute imports in three groups: stdlib, third-party, local.
- Meaningful names, no single letters except `_`, booleans as questions. No abstraction for one use; inline what can be inline; name intermediate *values* that are steps, not wrappers of one expression.
- Guard clauses first, happy path last and unnested. Expected failures are values: a typed result with a `StrEnum` outcome and a reason that includes the actual numbers; raise only for programmer errors.
- Pydantic models for every structured value crossing a function boundary. Optional fields are `X | None = None`, except in `contract/`, where every key is required.
- Limits and thresholds come from `settings`, never literals. Full modern type hints; Pyright strict. No docstrings; comments only for why.

## Tests

Red → green → refactor for every change, one behaviour per cycle. Run the failing test and watch it fail for the right reason before writing code. Never change or delete a test to make code pass. Tests mirror `src/` under `tests/`; routes are tested through `create_app( settings, fake_claude )` with `TestClient`, never a real server or the Claude API (use the scripted fake at the `claude.py` boundary). Every `LinkOutcome.FAILED` path has a test on its reason text. `tests/contract` fails if the committed JSON Schema differs from the export, and validates every golden example. Docker checks are marked `docker` and excluded from the normal run. Tests follow the code style.

## Reference example

```python
from enum import StrEnum

from pydantic import BaseModel

from atlas_agent.config import Settings
from atlas_agent.vault.links import LinkTarget
from atlas_agent.vault.notes import NoteSummary

class SuggestionKind( StrEnum ):
    EXISTING_NOTE = "existing_note"
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

    return target, SuggestionKind.NEW_CONCEPT

def limit_suggestions(
    suggestions: list[ CheckedSuggestion ],
    settings: Settings
) -> list[ CheckedSuggestion ]:
    if len( suggestions ) <= settings.max_suggestions:
        return suggestions

    return suggestions[ : settings.max_suggestions ]
```

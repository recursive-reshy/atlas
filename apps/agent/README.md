# Atlas vault agent service

A stateless Python 3.14 / FastAPI service that reads the Obsidian vaults (read-only) and runs Claude tool-use agents for the Express server. Its first endpoint, `POST /v1/link`, proposes `[[wikilinks]]` for a new note (ADRs 0042–0046). It has no database, no write access to the vault and no published port; only the server calls it, with a bearer secret.

The setup, configuration and troubleshooting are in the [root README](../../README.md) (Setup, Configuration, Troubleshooting). Working rules are in [CLAUDE.md](CLAUDE.md).

## Run it

Needs [uv](https://docs.astral.sh/uv/).

```sh
ANTHROPIC_API_KEY=… AGENT_SECRET=$(openssl rand -hex 32) VAULTS_ROOT=/path/to/vaults pnpm --filter @atlas/agent dev
```

`VAULTS_ROOT` is the folder that holds one folder per user; each request names its user's vault by `vault_dir` (ADR 0063). It listens on port 8100. Use the same `AGENT_SECRET` and `AGENT_URL=http://localhost:8100` in `apps/server/.env`.

## Checks

```sh
pnpm --filter @atlas/agent test        # pytest
pnpm --filter @atlas/agent lint        # ruff check
pnpm --filter @atlas/agent typecheck   # pyright
cd apps/agent && uv run pytest -m docker   # builds the image; needs Docker
```

The contract is Pydantic-first (`src/atlas_agent/contract/`). After changing it, regenerate `schema/link_contract.json` with `uv run python -m atlas_agent.contract.export` and update the Zod mirror in `packages/shared/src/agent.ts`.

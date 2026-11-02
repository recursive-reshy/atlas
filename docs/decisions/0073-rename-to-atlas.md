# 0073. The app is Atlas; Mnemosyne is its transcriber module

- Status: Accepted
- Date: 2026-11-02

## Context
The app began as Mnemosyne, a YouTube transcriber. It now holds two modules (the transcriber and Melete) and is planned to hold more (a wealth tracker, a freelance-jobs module, a business-idea validator). The name of the first module had become the name of the whole app. 0.10.0 creates cloud resources (a GCP project, bucket, registry, VM, secrets, OAuth client) whose names are hard or impossible to change later; a GCP project ID can never be renamed.

## Decision
- **Atlas is the app.** The repo, workspace packages (`@atlas/*`), the Python package (`atlas_agent`), the Compose project, images, database file (`atlas.db`), session cookie, page title, PWA manifest, drawer header, sign-in pages, docs and the new GCP project use Atlas.
- **Mnemosyne is the transcriber module's name**, alongside Melete. The drawer and Settings label the module Mnemosyne. Its internal ID stays `transcriber` (schema, routes, enums), since renaming it changes the schema for no visible gain.
- **Notes don't change.** The locked `mnemosyne` tag and the default `Mnemosyne` note folder stay: they mark the module's output, and the vault already holds notes with them.
- **The rename is the first checkpoint of 0.10.0**, before any cloud resource exists, and is behaviour-neutral.
- **A guard test** fails on any `mnemosyne` outside an allow-list (history docs, the tag, the folder, the module label).
- Past PRDs, TRDs, release notes and ADRs 0001–0072 stay as written; "Mnemosyne" there means the app.

## Consequences
- Cloud resources are created once, under their final names.
- Local Docker starts with an empty database (new file and volume name); acceptable before 1.0.
- The repo and local folder move (`~/Documents/Github/atlas`); Claude Code and VS Code see a new project path.
- Mixed naming is deliberate and documented: Atlas (app), Mnemosyne and Melete (modules), `transcriber` (internal ID).

## Alternatives considered
- **Keep Mnemosyne for everything.** No work, but the umbrella keeps a module's name as more modules arrive.
- **Rename after the cloud move.** Every cloud resource would carry the old name or be recreated.
- **Rename the module ID to `mnemosyne`.** Touches the schema and every route for an internal name nobody sees.
- **Label the module "Transcriber".** Plainer, but sits oddly next to Melete.

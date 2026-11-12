from enum import StrEnum
from pathlib import Path
from typing import Any

from atlas_agent.claude import ToolDefinition
from atlas_agent.config import Settings
from atlas_agent.runner import AgentTool, ToolResult
from atlas_agent.vault.links import list_link_targets
from atlas_agent.vault.notes import ReadNoteOutcome, list_notes, read_note
from atlas_agent.vault.search import search_vault

class VaultTool( StrEnum ):
    LIST_NOTES = "list_notes"
    SEARCH_VAULT = "search_vault"
    READ_NOTE = "read_note"
    LIST_LINK_TARGETS = "list_link_targets"

def vault_tools( root: Path, settings: Settings, include: list[ VaultTool ] ) -> list[ AgentTool ]:
    def run_list_notes( _: dict[ str, Any ] ) -> ToolResult:
        return ToolResult( content = list_notes( root, settings.list_notes_limit ).model_dump_json() )

    def run_search_vault( arguments: dict[ str, Any ] ) -> ToolResult:
        query = arguments.get( "query" )

        if not isinstance( query, str ):
            return ToolResult( content = "search_vault needs a 'query' string", is_error = True )

        result = search_vault( root, query, settings.search_hits_limit, settings.search_snippet_chars )

        return ToolResult( content = result.model_dump_json() )

    def run_read_note( arguments: dict[ str, Any ] ) -> ToolResult:
        path = arguments.get( "path" )

        if not isinstance( path, str ):
            return ToolResult( content = "read_note needs a 'path' string", is_error = True )

        read = read_note( root, path, settings.read_note_chars )

        if read.outcome == ReadNoteOutcome.FAILED or read.note is None:
            return ToolResult( content = read.reason or "Could not read the note", is_error = True )

        return ToolResult( content = read.note.model_dump_json() )

    def run_list_link_targets( _: dict[ str, Any ] ) -> ToolResult:
        return ToolResult( content = list_link_targets( root, settings.link_targets_limit ).model_dump_json() )

    tools = [
        AgentTool(
            definition = ToolDefinition(
                name = VaultTool.LIST_NOTES,
                description = "List the vault's notes with their path, title and tags.",
                input_schema = { "type": "object", "properties": {} }
            ),
            run = run_list_notes
        ),
        AgentTool(
            definition = ToolDefinition(
                name = VaultTool.SEARCH_VAULT,
                description = (
                    "Search the text of the vault's notes. Every term must appear on the same line; "
                    "wrap a phrase in double quotes to keep it together. Returns path, line and a snippet."
                ),
                input_schema = {
                    "type": "object",
                    "properties": { "query": { "type": "string", "description": "Search terms or a quoted phrase" } },
                    "required": [ "query" ]
                }
            ),
            run = run_search_vault
        ),
        AgentTool(
            definition = ToolDefinition(
                name = VaultTool.READ_NOTE,
                description = "Read one note from the vault by its path, as returned by list_notes or search_vault.",
                input_schema = {
                    "type": "object",
                    "properties": { "path": { "type": "string", "description": "Path relative to the vault root" } },
                    "required": [ "path" ]
                }
            ),
            run = run_read_note
        ),
        AgentTool(
            definition = ToolDefinition(
                name = VaultTool.LIST_LINK_TARGETS,
                description = (
                    "List every link target already used in the vault, with how many times it is used "
                    "and whether a note exists for it. Targets with no note are concepts."
                ),
                input_schema = { "type": "object", "properties": {} }
            ),
            run = run_list_link_targets
        )
    ]

    return [ tool for tool in tools if tool.definition.name in include ]

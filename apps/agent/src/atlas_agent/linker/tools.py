from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from atlas_agent.claude import ToolDefinition
from atlas_agent.config import Settings
from atlas_agent.vault.links import list_link_targets
from atlas_agent.vault.notes import ReadNoteOutcome, list_notes, read_note
from atlas_agent.vault.search import search_vault

class SubmittedSuggestion( BaseModel ):
    target: str = Field( min_length = 1, max_length = 200 )
    anchor: str | None = None
    reason: str = Field( min_length = 1, max_length = 300 )

class SubmitSuggestions( BaseModel ):
    suggestions: list[ SubmittedSuggestion ]

class ToolResult( BaseModel ):
    content: str
    is_error: bool = False

def build_tool_definitions() -> list[ ToolDefinition ]:
    return [
        ToolDefinition(
            name = "list_notes",
            description = "List the vault's notes with their path, title and tags.",
            input_schema = { "type": "object", "properties": {} }
        ),
        ToolDefinition(
            name = "search_vault",
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
        ToolDefinition(
            name = "read_note",
            description = "Read one note from the vault by its path, as returned by list_notes or search_vault.",
            input_schema = {
                "type": "object",
                "properties": { "path": { "type": "string", "description": "Path relative to the vault root" } },
                "required": [ "path" ]
            }
        ),
        ToolDefinition(
            name = "list_link_targets",
            description = (
                "List every link target already used in the vault, with how many times it is used "
                "and whether a note exists for it. Targets with no note are concepts."
            ),
            input_schema = { "type": "object", "properties": {} }
        ),
        ToolDefinition(
            name = "submit_suggestions",
            description = "Submit the final link suggestions for the note. This ends the run.",
            input_schema = SubmitSuggestions.model_json_schema()
        )
    ]

def run_vault_tool( name: str, arguments: dict[ str, Any ], settings: Settings, root: Path ) -> ToolResult:

    if name == "list_notes":
        return ToolResult( content = list_notes( root, settings.list_notes_limit ).model_dump_json() )

    if name == "list_link_targets":
        return ToolResult( content = list_link_targets( root, settings.link_targets_limit ).model_dump_json() )

    if name == "search_vault":
        query = arguments.get( "query" )

        if not isinstance( query, str ):
            return ToolResult( content = "search_vault needs a 'query' string", is_error = True )

        result = search_vault( root, query, settings.search_hits_limit, settings.search_snippet_chars )

        return ToolResult( content = result.model_dump_json() )

    if name == "read_note":
        path = arguments.get( "path" )

        if not isinstance( path, str ):
            return ToolResult( content = "read_note needs a 'path' string", is_error = True )

        read = read_note( root, path, settings.read_note_chars )

        if read.outcome == ReadNoteOutcome.FAILED or read.note is None:
            return ToolResult( content = read.reason or "Could not read the note", is_error = True )

        return ToolResult( content = read.note.model_dump_json() )

    return ToolResult( content = f"Unknown tool '{name}'", is_error = True )

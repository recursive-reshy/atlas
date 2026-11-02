import json
from pathlib import Path

from atlas_agent.config import Settings
from atlas_agent.linker.tools import build_tool_definitions, run_vault_tool

def test_defines_the_five_tools_in_order() -> None:
    names = [ tool.name for tool in build_tool_definitions() ]

    assert names == [ "list_notes", "search_vault", "read_note", "list_link_targets", "submit_suggestions" ]

def test_every_tool_has_a_description_and_an_object_schema() -> None:
    for tool in build_tool_definitions():
        assert tool.description
        assert tool.input_schema[ "type" ] == "object"

def test_search_and_read_tools_require_their_argument() -> None:
    schemas = { tool.name: tool.input_schema for tool in build_tool_definitions() }

    assert schemas[ "search_vault" ][ "required" ] == [ "query" ]
    assert schemas[ "read_note" ][ "required" ] == [ "path" ]

def test_the_submit_tool_takes_suggestions_without_a_kind() -> None:
    schema = next( tool.input_schema for tool in build_tool_definitions() if tool.name == "submit_suggestions" )
    suggestion = schema[ "$defs" ][ "SubmittedSuggestion" ]

    assert schema[ "required" ] == [ "suggestions" ]
    assert sorted( suggestion[ "properties" ] ) == [ "anchor", "reason", "target" ]
    assert "kind" not in suggestion[ "properties" ]

def test_list_notes_returns_json_with_the_notes( settings: Settings, vault_copy: Path ) -> None:
    result = run_vault_tool( "list_notes", {}, settings, vault_copy )

    assert result.is_error is False
    assert len( json.loads( result.content )[ "notes" ] ) == 8

def test_list_notes_uses_the_limit_from_settings( settings: Settings, vault_copy: Path ) -> None:
    result = run_vault_tool( "list_notes", {}, settings.model_copy( update = { "list_notes_limit": 2 } ), vault_copy )

    assert json.loads( result.content )[ "omitted" ] == 6

def test_search_vault_returns_hits( settings: Settings, vault_copy: Path ) -> None:
    result = run_vault_tool( "search_vault", { "query": "marketplace" }, settings, vault_copy )

    assert json.loads( result.content )[ "hits" ][ 0 ][ "path" ] == "Ideas/Marketplace Idea.md"

def test_search_vault_uses_the_limits_from_settings( settings: Settings, vault_copy: Path ) -> None:
    limited = settings.model_copy( update = { "search_hits_limit": 1, "search_snippet_chars": 5 } )
    hits = json.loads( run_vault_tool( "search_vault", { "query": "pricing" }, limited, vault_copy ).content )

    assert len( hits[ "hits" ] ) == 1
    assert len( hits[ "hits" ][ 0 ][ "snippet" ] ) <= 5
    assert hits[ "omitted" ] == 3

def test_read_note_returns_the_content( settings: Settings, vault_copy: Path ) -> None:
    result = run_vault_tool( "read_note", { "path": "Index.md" }, settings, vault_copy )

    assert json.loads( result.content )[ "title" ] == "Index"

def test_read_note_uses_the_character_limit_from_settings( settings: Settings, vault_copy: Path ) -> None:
    limited = settings.model_copy( update = { "read_note_chars": 4 } )
    note = json.loads( run_vault_tool( "read_note", { "path": "Index.md" }, limited, vault_copy ).content )

    assert note[ "content" ] == "# In"
    assert note[ "truncated" ] is True

def test_read_note_reports_a_bad_path_as_an_error( settings: Settings, vault_copy: Path ) -> None:
    result = run_vault_tool( "read_note", { "path": "../Index.md" }, settings, vault_copy )

    assert result.is_error is True
    assert result.content == "Path '../Index.md' is outside the vault"

def test_list_link_targets_returns_targets_with_uses( settings: Settings, vault_copy: Path ) -> None:
    targets = json.loads( run_vault_tool( "list_link_targets", {}, settings, vault_copy ).content )[ "targets" ]

    assert targets[ 0 ] == { "target": "Customer Discovery", "uses": 3, "has_note": False }

def test_a_missing_argument_is_an_error_naming_it( settings: Settings, vault_copy: Path ) -> None:
    result = run_vault_tool( "search_vault", {}, settings, vault_copy )

    assert result.is_error is True
    assert result.content == "search_vault needs a 'query' string"

def test_a_non_string_argument_is_an_error( settings: Settings, vault_copy: Path ) -> None:
    result = run_vault_tool( "read_note", { "path": 7 }, settings, vault_copy )

    assert result.is_error is True
    assert result.content == "read_note needs a 'path' string"

def test_an_unknown_tool_is_an_error( settings: Settings, vault_copy: Path ) -> None:
    result = run_vault_tool( "delete_note", {}, settings, vault_copy )

    assert result.is_error is True
    assert result.content == "Unknown tool 'delete_note'"

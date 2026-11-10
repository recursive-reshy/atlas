import json
from pathlib import Path

from atlas_agent.config import Settings
from atlas_agent.runner import AgentTool
from atlas_agent.vault.toolset import VaultTool, vault_tools

ALL_TOOLS = [ VaultTool.LIST_NOTES, VaultTool.SEARCH_VAULT, VaultTool.READ_NOTE, VaultTool.LIST_LINK_TARGETS ]

def run_tool( tools: list[ AgentTool ], name: str, arguments: dict[ str, object ] ) -> tuple[ str, bool ]:
    tool = next( tool for tool in tools if tool.definition.name == name )
    result = tool.run( arguments )

    return result.content, result.is_error

def test_defines_the_four_tools_in_order( settings: Settings, vault_copy: Path ) -> None:
    names = [ tool.definition.name for tool in vault_tools( vault_copy, settings, ALL_TOOLS ) ]

    assert names == [ "list_notes", "search_vault", "read_note", "list_link_targets" ]

def test_includes_only_the_tools_asked_for_in_their_own_order( settings: Settings, vault_copy: Path ) -> None:
    include = [ VaultTool.READ_NOTE, VaultTool.LIST_NOTES ]
    names = [ tool.definition.name for tool in vault_tools( vault_copy, settings, include ) ]

    assert names == [ "list_notes", "read_note" ]

def test_every_tool_has_a_description_and_an_object_schema( settings: Settings, vault_copy: Path ) -> None:
    for tool in vault_tools( vault_copy, settings, ALL_TOOLS ):
        assert tool.definition.description
        assert tool.definition.input_schema[ "type" ] == "object"

def test_search_and_read_tools_require_their_argument( settings: Settings, vault_copy: Path ) -> None:
    schemas = { tool.definition.name: tool.definition.input_schema for tool in vault_tools( vault_copy, settings, ALL_TOOLS ) }

    assert schemas[ "search_vault" ][ "required" ] == [ "query" ]
    assert schemas[ "read_note" ][ "required" ] == [ "path" ]

def test_list_notes_returns_json_with_the_notes( settings: Settings, vault_copy: Path ) -> None:
    content, is_error = run_tool( vault_tools( vault_copy, settings, ALL_TOOLS ), "list_notes", {} )

    assert is_error is False
    assert len( json.loads( content )[ "notes" ] ) == 8

def test_list_notes_uses_the_limit_from_settings( settings: Settings, vault_copy: Path ) -> None:
    tools = vault_tools( vault_copy, settings.model_copy( update = { "list_notes_limit": 2 } ), ALL_TOOLS )
    content, _ = run_tool( tools, "list_notes", {} )

    assert json.loads( content )[ "omitted" ] == 6

def test_the_tools_read_from_the_root_they_are_given( settings: Settings, vault_copy: Path ) -> None:
    ideas = vault_copy / "Ideas"
    content, _ = run_tool( vault_tools( ideas, settings, ALL_TOOLS ), "list_notes", {} )
    paths = [ note[ "path" ] for note in json.loads( content )[ "notes" ] ]

    assert paths
    assert all( not path.startswith( "Ideas/" ) for path in paths )
    assert "Index.md" not in paths

def test_a_note_outside_the_root_cannot_be_read( settings: Settings, vault_copy: Path ) -> None:
    tools = vault_tools( vault_copy / "Ideas", settings, ALL_TOOLS )
    content, is_error = run_tool( tools, "read_note", { "path": "../Index.md" } )

    assert is_error is True
    assert content == "Path '../Index.md' is outside the vault"

def test_search_vault_returns_hits( settings: Settings, vault_copy: Path ) -> None:
    content, _ = run_tool( vault_tools( vault_copy, settings, ALL_TOOLS ), "search_vault", { "query": "marketplace" } )

    assert json.loads( content )[ "hits" ][ 0 ][ "path" ] == "Ideas/Marketplace Idea.md"

def test_search_vault_uses_the_limits_from_settings( settings: Settings, vault_copy: Path ) -> None:
    limited = settings.model_copy( update = { "search_hits_limit": 1, "search_snippet_chars": 5 } )
    content, _ = run_tool( vault_tools( vault_copy, limited, ALL_TOOLS ), "search_vault", { "query": "pricing" } )
    hits = json.loads( content )

    assert len( hits[ "hits" ] ) == 1
    assert len( hits[ "hits" ][ 0 ][ "snippet" ] ) <= 5
    assert hits[ "omitted" ] == 3

def test_read_note_returns_the_content( settings: Settings, vault_copy: Path ) -> None:
    content, _ = run_tool( vault_tools( vault_copy, settings, ALL_TOOLS ), "read_note", { "path": "Index.md" } )

    assert json.loads( content )[ "title" ] == "Index"

def test_read_note_uses_the_character_limit_from_settings( settings: Settings, vault_copy: Path ) -> None:
    limited = settings.model_copy( update = { "read_note_chars": 4 } )
    content, _ = run_tool( vault_tools( vault_copy, limited, ALL_TOOLS ), "read_note", { "path": "Index.md" } )
    note = json.loads( content )

    assert note[ "content" ] == "# In"
    assert note[ "truncated" ] is True

def test_read_note_reports_a_bad_path_as_an_error( settings: Settings, vault_copy: Path ) -> None:
    content, is_error = run_tool( vault_tools( vault_copy, settings, ALL_TOOLS ), "read_note", { "path": "../Index.md" } )

    assert is_error is True
    assert content == "Path '../Index.md' is outside the vault"

def test_list_link_targets_returns_targets_with_uses( settings: Settings, vault_copy: Path ) -> None:
    content, _ = run_tool( vault_tools( vault_copy, settings, ALL_TOOLS ), "list_link_targets", {} )

    assert json.loads( content )[ "targets" ][ 0 ] == { "target": "Customer Discovery", "uses": 3, "has_note": False }

def test_a_missing_argument_is_an_error_naming_it( settings: Settings, vault_copy: Path ) -> None:
    content, is_error = run_tool( vault_tools( vault_copy, settings, ALL_TOOLS ), "search_vault", {} )

    assert is_error is True
    assert content == "search_vault needs a 'query' string"

def test_a_non_string_argument_is_an_error( settings: Settings, vault_copy: Path ) -> None:
    content, is_error = run_tool( vault_tools( vault_copy, settings, ALL_TOOLS ), "read_note", { "path": 7 } )

    assert is_error is True
    assert content == "read_note needs a 'path' string"

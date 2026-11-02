import json
from pathlib import Path

from atlas_agent.contract.export import build_schema

SCHEMA_PATH = Path( __file__ ).parents[ 2 ] / "schema" / "link_contract.json"

def test_committed_schema_matches_the_models() -> None:
    assert SCHEMA_PATH.read_text() == build_schema()

def test_schema_is_sorted_two_space_indented_and_ends_with_a_newline() -> None:
    text = build_schema()
    parsed = json.loads( text )

    assert text == json.dumps( parsed, indent = 2, sort_keys = True ) + "\n"

def test_schema_defines_every_model() -> None:
    definitions = json.loads( build_schema() )[ "$defs" ]

    assert sorted( definitions ) == [
        "InstructionsResponse",
        "LinkNote",
        "LinkOutcome",
        "LinkRequest",
        "LinkResponse",
        "LinkSuggestion",
        "LinkUsage",
        "SuggestionKind"
    ]

def test_requests_use_validation_mode_and_responses_serialization_mode() -> None:
    definitions = json.loads( build_schema() )[ "$defs" ]

    assert "folder" in definitions[ "LinkNote" ][ "required" ]
    assert sorted( definitions[ "LinkResponse" ][ "required" ] ) == [ "outcome", "reason", "suggestions", "usage" ]
    assert sorted( definitions[ "LinkSuggestion" ][ "required" ] ) == [ "anchor", "kind", "reason", "target" ]

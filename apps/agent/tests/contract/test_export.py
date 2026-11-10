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
        "AgentUsage",
        "FailedLinkResponse",
        "InstructionsResponse",
        "LinkNote",
        "LinkRequest",
        "LinkResponse",
        "LinkSuggestion",
        "LinkedResponse",
        "SuggestionKind"
    ]

def test_requests_use_validation_mode_and_responses_serialization_mode() -> None:
    definitions = json.loads( build_schema() )[ "$defs" ]

    assert "folder" in definitions[ "LinkNote" ][ "required" ]
    assert sorted( definitions[ "LinkedResponse" ][ "required" ] ) == [ "outcome", "reason", "suggestions", "usage" ]
    assert sorted( definitions[ "FailedLinkResponse" ][ "required" ] ) == [ "outcome", "reason", "suggestions", "usage" ]
    assert sorted( definitions[ "LinkSuggestion" ][ "required" ] ) == [ "anchor", "kind", "reason", "target" ]

def test_link_response_is_a_union_discriminated_on_outcome() -> None:
    definitions = json.loads( build_schema() )[ "$defs" ]
    union = definitions[ "LinkResponse" ]

    assert union[ "discriminator" ][ "propertyName" ] == "outcome"
    assert [ option[ "$ref" ] for option in union[ "oneOf" ] ] == [
        "#/$defs/LinkedResponse",
        "#/$defs/FailedLinkResponse"
    ]
    assert definitions[ "LinkedResponse" ][ "properties" ][ "outcome" ][ "const" ] == "linked"
    assert definitions[ "FailedLinkResponse" ][ "properties" ][ "outcome" ][ "const" ] == "failed"

def test_a_failed_response_needs_a_reason_and_no_suggestions() -> None:
    failed = json.loads( build_schema() )[ "$defs" ][ "FailedLinkResponse" ]

    assert failed[ "properties" ][ "reason" ][ "minLength" ] == 1
    assert failed[ "properties" ][ "suggestions" ][ "maxItems" ] == 0

def test_a_linked_response_keeps_reason_as_a_required_null() -> None:
    linked = json.loads( build_schema() )[ "$defs" ][ "LinkedResponse" ]

    assert "reason" in linked[ "required" ]
    assert linked[ "properties" ][ "reason" ] == { "type": "null", "title": "Reason" }

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from atlas_agent.contract.link import (
    AgentUsage,
    InstructionsResponse,
    LinkNote,
    LinkRequest,
    LinkResponse,
    LinkSuggestion
)

EXAMPLES_PATH = Path( __file__ ).parents[ 2 ] / "schema" / "examples"

MODELS: dict[ str, type[ BaseModel ] ] = {
    "LinkNote": LinkNote,
    "LinkRequest": LinkRequest,
    "LinkSuggestion": LinkSuggestion,
    "AgentUsage": AgentUsage,
    "LinkResponse": LinkResponse,
    "InstructionsResponse": InstructionsResponse
}

REQUIRED_VALID = [
    "link-request.json",
    "link-request-empty-vault.json",
    "link-response-linked.json",
    "link-response-linked-empty.json",
    "link-response-failed.json",
    "instructions-response.json"
]

REQUIRED_INVALID = [
    "link-request-empty-body.json",
    "link-request-no-model.json",
    "link-request-no-vault-dir.json",
    "link-request-bad-vault-dir.json",
    "link-response-unknown-kind.json",
    "link-response-failed-no-reason.json",
    "link-response-failed-with-suggestions.json",
    "link-response-linked-with-reason.json"
]

def load_example( path: Path ) -> tuple[ str, Any ]:
    example = json.loads( path.read_text() )
    return example[ "schema" ], example[ "value" ]

def validate_example( schema_name: str, value: Any ) -> None:
    if schema_name not in MODELS:
        pytest.fail( f"Unknown schema name {schema_name!r}" )

    MODELS[ schema_name ].model_validate( value )

def test_the_required_examples_exist() -> None:
    valid_names = { path.name for path in ( EXAMPLES_PATH / "valid" ).glob( "*.json" ) }
    invalid_names = { path.name for path in ( EXAMPLES_PATH / "invalid" ).glob( "*.json" ) }

    assert set( REQUIRED_VALID ) <= valid_names
    assert set( REQUIRED_INVALID ) <= invalid_names

def test_an_unknown_schema_name_fails( tmp_path: Path ) -> None:
    path = tmp_path / "unknown.json"
    path.write_text( json.dumps( { "schema": "Nope", "value": {} } ) )
    schema_name, value = load_example( path )

    with pytest.raises( pytest.fail.Exception, match = "Nope" ):
        validate_example( schema_name, value )

@pytest.mark.parametrize( "path", sorted( ( EXAMPLES_PATH / "valid" ).glob( "*.json" ) ), ids = lambda path: path.name )
def test_valid_examples_validate( path: Path ) -> None:
    schema_name, value = load_example( path )

    validate_example( schema_name, value )

@pytest.mark.parametrize( "path", sorted( ( EXAMPLES_PATH / "invalid" ).glob( "*.json" ) ), ids = lambda path: path.name )
def test_invalid_examples_are_rejected( path: Path ) -> None:
    schema_name, value = load_example( path )

    with pytest.raises( ValidationError ):
        validate_example( schema_name, value )

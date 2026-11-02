import json
import logging
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from atlas_agent.config import Settings
from atlas_agent.contract.link import LinkResponse
from atlas_agent.logging_setup import configure_logging
from atlas_agent.claude import ClaudeError
from atlas_agent.main import create_app
from tests.fakes import ScriptedClaude, submit_reply, tool_reply

def make_body( **note_overrides: Any ) -> dict[ str, Any ]:
    note: dict[ str, Any ] = {
        "title": "Pricing a developer tool",
        "tags": [ "saas" ],
        "folder": "Ideas",
        "body": "Usage-based pricing aligns cost with value."
    }

    return {
        "note": { **note, **note_overrides },
        "vault_dir": "vault",
        "model": "model-under-test",
        "guidance": "Prefer a few strong links."
    }

def make_client( settings: Settings, claude: ScriptedClaude ) -> TestClient:
    return TestClient( create_app( settings, claude ) )

def test_returns_computed_suggestions_for_a_valid_request( settings: Settings, auth_headers: dict[ str, str ] ) -> None:
    claude = ScriptedClaude(
        [
            tool_reply( ( "list_link_targets", {} ) ),
            submit_reply(
                [
                    { "target": "Pricing Playbook", "anchor": "Usage-based pricing", "reason": "Same topic." },
                    { "target": "customer discovery", "anchor": None, "reason": "Talk to users." },
                    { "target": "Free Tier", "anchor": None, "reason": "Mentioned." }
                ]
            )
        ]
    )

    response = make_client( settings, claude ).post( "/v1/link", json = make_body(), headers = auth_headers )
    body = response.json()

    assert response.status_code == 200
    assert body[ "outcome" ] == "linked"
    assert body[ "reason" ] is None
    assert [ ( suggestion[ "target" ], suggestion[ "kind" ] ) for suggestion in body[ "suggestions" ] ] == [
        ( "Pricing Playbook", "existing_note" ),
        ( "Customer Discovery", "existing_concept" ),
        ( "Free Tier", "new_concept" )
    ]
    assert body[ "usage" ][ "turns" ] == 2
    assert body[ "usage" ][ "tool_calls" ] == 2
    assert LinkResponse.model_validate( body ).outcome.value == "linked"

def test_an_empty_vault_still_gets_concept_suggestions(
    settings: Settings,
    auth_headers: dict[ str, str ],
    tmp_path: Path
) -> None:
    ( tmp_path / "vaults" / "empty" ).mkdir( parents = True )
    empty = settings.model_copy( update = { "vaults_root": tmp_path / "vaults" } )
    claude = ScriptedClaude(
        [ submit_reply( [ { "target": "Pricing Strategy", "anchor": "Usage-based pricing", "reason": "Core topic." } ] ) ]
    )

    body = make_client( empty, claude ).post( "/v1/link", json = { **make_body(), "vault_dir": "empty" }, headers = auth_headers ).json()

    assert body[ "suggestions" ][ 0 ][ "kind" ] == "new_concept"

def test_an_unknown_vault_is_a_422_before_claude_is_called( settings: Settings, auth_headers: dict[ str, str ] ) -> None:
    claude = ScriptedClaude( [] )
    body = { **make_body(), "vault_dir": "missing" }

    response = make_client( settings, claude ).post( "/v1/link", json = body, headers = auth_headers )

    assert response.status_code == 422
    assert response.json() == { "error": "unknown_vault" }
    assert claude.requests == []

def test_a_vault_dir_that_climbs_out_is_a_failed_response( settings: Settings, auth_headers: dict[ str, str ] ) -> None:
    body = { **make_body(), "vault_dir": "../vault" }

    response = make_client( settings, ScriptedClaude( [] ) ).post( "/v1/link", json = body, headers = auth_headers )

    assert response.status_code == 200
    assert response.json()[ "outcome" ] == "failed"
    assert response.json()[ "reason" ] == "Invalid request: 1 error, first at vault_dir"

def test_a_request_for_the_secret_is_still_checked_before_the_vault( settings: Settings ) -> None:
    body = { **make_body(), "vault_dir": "missing" }

    response = make_client( settings, ScriptedClaude( [] ) ).post( "/v1/link", json = body )

    assert response.status_code == 401

def test_a_claude_api_error_is_a_failed_response_not_an_http_error(
    settings: Settings,
    auth_headers: dict[ str, str ]
) -> None:
    claude = ScriptedClaude( [ ClaudeError( 429, "slow down" ) ] )

    response = make_client( settings, claude ).post( "/v1/link", json = make_body(), headers = auth_headers )

    assert response.status_code == 200
    assert response.json()[ "outcome" ] == "failed"
    assert response.json()[ "reason" ] == "Claude API error 429: slow down"
    assert response.json()[ "suggestions" ] == []

def test_an_invalid_body_is_a_failed_response_with_zero_usage(
    settings: Settings,
    auth_headers: dict[ str, str ]
) -> None:
    claude = ScriptedClaude( [] )

    response = make_client( settings, claude ).post( "/v1/link", json = make_body( body = "" ), headers = auth_headers )

    assert response.status_code == 200
    assert response.json() == {
        "outcome": "failed",
        "reason": "Invalid request: 1 error, first at note.body",
        "suggestions": [],
        "usage": {
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_read_input_tokens": 0,
            "cache_creation_input_tokens": 0,
            "tool_calls": 0,
            "turns": 0
        }
    }
    assert claude.requests == []

def test_the_reason_counts_every_error_and_names_the_first_field(
    settings: Settings,
    auth_headers: dict[ str, str ]
) -> None:
    response = make_client( settings, ScriptedClaude( [] ) ).post( "/v1/link", json = {}, headers = auth_headers )

    assert response.status_code == 200
    assert response.json()[ "reason" ] == "Invalid request: 4 errors, first at note"

def test_a_body_that_is_not_json_is_a_failed_response(
    settings: Settings,
    auth_headers: dict[ str, str ]
) -> None:
    headers = { **auth_headers, "Content-Type": "application/json" }

    response = make_client( settings, ScriptedClaude( [] ) ).post( "/v1/link", content = "{nope", headers = headers )

    assert response.status_code == 200
    assert response.json()[ "outcome" ] == "failed"
    assert response.json()[ "reason" ] == "Invalid request: body is not valid JSON"

def test_a_missing_secret_is_unauthorized( settings: Settings ) -> None:
    response = make_client( settings, ScriptedClaude( [] ) ).post( "/v1/link", json = make_body() )

    assert response.status_code == 401
    assert response.json() == { "detail": "unauthorized" }

def test_a_wrong_secret_is_unauthorized_even_with_an_invalid_body( settings: Settings ) -> None:
    client = make_client( settings, ScriptedClaude( [] ) )
    headers = { "Authorization": "Bearer wrong" }

    assert client.post( "/v1/link", json = make_body(), headers = headers ).status_code == 401
    assert client.post( "/v1/link", json = {}, headers = headers ).status_code == 401

def test_logs_tool_calls_and_tokens_but_no_content(
    settings: Settings,
    auth_headers: dict[ str, str ],
    caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level( logging.INFO, logger = "atlas_agent" )
    claude = ScriptedClaude( [ submit_reply( [ { "target": "Free Tier", "anchor": None, "reason": "Mentioned." } ] ) ] )
    body = { **make_body( title = "title-sentinel", body = "body-sentinel" ), "guidance": "guidance-sentinel" }

    make_client( settings, claude ).post( "/v1/link", json = body, headers = auth_headers )

    line = caplog.records[ 0 ].getMessage()

    assert "POST /v1/link 200" in line
    assert "outcome=linked" in line
    assert "tool_calls=1" in line
    assert "input_tokens=100" in line
    assert "output_tokens=10" in line

    for forbidden in [ "title-sentinel", "body-sentinel", "guidance-sentinel", "Free Tier", settings.agent_secret, settings.anthropic_api_key ]:
        assert forbidden not in caplog.text

def test_the_json_log_line_of_a_link_run_has_its_fields_and_none_of_the_content(
    settings: Settings,
    auth_headers: dict[ str, str ],
    capsys: pytest.CaptureFixture[ str ]
) -> None:
    configure_logging( "debug" )
    claude = ScriptedClaude( [ submit_reply( [ { "target": "Free Tier", "anchor": None, "reason": "Mentioned." } ] ) ] )
    body = { **make_body( title = "title-sentinel", body = "body-sentinel" ), "guidance": "guidance-sentinel" }

    make_client( settings, claude ).post( "/v1/link", json = body, headers = auth_headers )

    output = capsys.readouterr().err
    line = json.loads( output.splitlines()[ 0 ] )

    assert line[ "outcome" ] == "linked"
    assert line[ "tool_calls" ] == 1
    assert line[ "input_tokens" ] == 100
    assert line[ "output_tokens" ] == 10

    for forbidden in [ "title-sentinel", "body-sentinel", "guidance-sentinel", "Free Tier", settings.agent_secret, settings.anthropic_api_key ]:
        assert forbidden not in output

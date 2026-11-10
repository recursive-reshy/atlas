import logging
from typing import Any

import pytest
from fastapi.testclient import TestClient

from atlas_agent.config import Settings
from atlas_agent.contract.syllabus import SyllabusResponse
from atlas_agent.main import create_app
from atlas_agent.syllabus.instructions import LOCKED_INSTRUCTIONS
from tests.fakes import ScriptedClaude, tool_reply

SECTIONS = [ { "name": "Pricing", "concepts": [ { "name": "Usage-Based Pricing", "description": "Charge by use." } ] } ]

def make_body( **overrides: Any ) -> dict[ str, Any ]:
    body: dict[ str, Any ] = {
        "vault_dir": "vault",
        "subject_folder": "Ideas",
        "name": "Pricing",
        "level": "working",
        "intent": None,
        "model": "model-under-test",
        "guidance": "Prefer practice."
    }
    return { **body, **overrides }

def make_client( settings: Settings, claude: ScriptedClaude ) -> TestClient:
    return TestClient( create_app( settings, claude ) )

def test_returns_a_drafted_syllabus( settings: Settings, auth_headers: dict[ str, str ] ) -> None:
    claude = ScriptedClaude( [ tool_reply( ( "submit_syllabus", { "sections": SECTIONS } ) ) ] )

    response = make_client( settings, claude ).post( "/v1/syllabus", json = make_body(), headers = auth_headers )
    body = response.json()

    assert response.status_code == 200
    assert body[ "outcome" ] == "drafted"
    assert body[ "reason" ] is None
    assert body[ "sections" ] == SECTIONS
    assert body[ "usage" ][ "turns" ] == 1
    assert SyllabusResponse.model_validate( body ).root.outcome.value == "drafted"

def test_a_missing_folder_is_a_failed_response( settings: Settings, auth_headers: dict[ str, str ] ) -> None:
    response = make_client( settings, ScriptedClaude( [] ) ).post(
        "/v1/syllabus",
        json = make_body( subject_folder = "Nope" ),
        headers = auth_headers
    )

    assert response.status_code == 200
    assert response.json()[ "outcome" ] == "failed"
    assert response.json()[ "reason" ] == "Subject folder not found"

def test_an_unknown_vault_is_a_422( settings: Settings, auth_headers: dict[ str, str ] ) -> None:
    claude = ScriptedClaude( [] )
    response = make_client( settings, claude ).post( "/v1/syllabus", json = make_body( vault_dir = "nobody" ), headers = auth_headers )

    assert response.status_code == 422
    assert response.json() == { "error": "unknown_vault" }
    assert claude.requests == []

def test_an_invalid_body_is_a_failed_syllabus_with_zero_usage( settings: Settings, auth_headers: dict[ str, str ] ) -> None:
    claude = ScriptedClaude( [] )

    response = make_client( settings, claude ).post( "/v1/syllabus", json = make_body( name = "" ), headers = auth_headers )

    assert response.status_code == 200
    assert response.json() == {
        "outcome": "failed",
        "reason": "Invalid request: 1 error, first at name",
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

def test_a_folder_that_climbs_out_is_an_invalid_request( settings: Settings, auth_headers: dict[ str, str ] ) -> None:
    response = make_client( settings, ScriptedClaude( [] ) ).post(
        "/v1/syllabus",
        json = make_body( subject_folder = "../other" ),
        headers = auth_headers
    )

    assert response.json()[ "reason" ] == "Invalid request: 1 error, first at subject_folder"

def test_the_link_route_still_answers_a_failed_link_response_for_a_bad_body(
    settings: Settings,
    auth_headers: dict[ str, str ]
) -> None:
    response = make_client( settings, ScriptedClaude( [] ) ).post( "/v1/link", json = {}, headers = auth_headers )

    assert response.json()[ "suggestions" ] == []

def test_a_missing_or_wrong_secret_is_unauthorized( settings: Settings ) -> None:
    client = make_client( settings, ScriptedClaude( [] ) )

    assert client.post( "/v1/syllabus", json = make_body() ).status_code == 401
    assert client.post( "/v1/syllabus", json = {}, headers = { "Authorization": "Bearer wrong" } ).status_code == 401
    assert client.get( "/v1/syllabus/instructions" ).status_code == 401

def test_serves_the_locked_instructions( settings: Settings, auth_headers: dict[ str, str ] ) -> None:
    response = make_client( settings, ScriptedClaude( [] ) ).get( "/v1/syllabus/instructions", headers = auth_headers )

    assert response.status_code == 200
    assert response.json() == { "instructions": LOCKED_INSTRUCTIONS }

def test_logs_the_outcome_and_tokens_but_no_content(
    settings: Settings,
    auth_headers: dict[ str, str ],
    caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level( logging.INFO, logger = "atlas_agent" )
    claude = ScriptedClaude( [ tool_reply( ( "submit_syllabus", { "sections": SECTIONS } ) ) ] )
    body = make_body( name = "name-sentinel", intent = "intent-sentinel", guidance = "guidance-sentinel" )

    make_client( settings, claude ).post( "/v1/syllabus", json = body, headers = auth_headers )

    line = caplog.records[ 0 ].getMessage()

    assert "POST /v1/syllabus 200" in line
    assert "outcome=drafted" in line
    assert "tool_calls=1" in line
    assert "input_tokens=100" in line

    for forbidden in [ "name-sentinel", "intent-sentinel", "guidance-sentinel", "Usage-Based", settings.agent_secret ]:
        assert forbidden not in caplog.text

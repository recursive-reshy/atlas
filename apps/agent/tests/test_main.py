import importlib
import json
import logging
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from atlas_agent import main
from atlas_agent.claude import AnthropicClaude
from atlas_agent.config import ClaudeAuth, ConfigError, Settings
from atlas_agent.logging_setup import configure_logging
from atlas_agent.main import create_app, create_secret_check
from tests.fakes import ScriptedClaude

def test_health_is_ok_without_auth( settings: Settings, app_factory: Callable[ [ Settings ], FastAPI ] ) -> None:
    response = TestClient( app_factory( settings ) ).get( "/health" )

    assert response.status_code == 200
    assert response.json() == { "status": "ok", "vault": "readable", "claude_credential": "api_key" }

def test_health_reports_federation_as_the_credential_source(
    settings: Settings,
    app_factory: Callable[ [ Settings ], FastAPI ]
) -> None:
    federated = settings.model_copy( update = { "claude_auth": ClaudeAuth( kind = "federation" ) } )
    body = TestClient( app_factory( federated ) ).get( "/health" ).json()

    assert body[ "claude_credential" ] == "federation"

def test_health_is_unavailable_when_the_vaults_root_cannot_be_listed(
    settings: Settings,
    app_factory: Callable[ [ Settings ], FastAPI ]
) -> None:
    client = TestClient( app_factory( settings ) )
    shutil.rmtree( settings.vaults_root )

    response = client.get( "/health" )

    assert response.status_code == 503
    assert response.json() == { "status": "error", "vault": "unreadable" }

@pytest.mark.parametrize( "path", [ "/docs", "/redoc", "/openapi.json" ] )
def test_documentation_routes_are_off(
    path: str,
    settings: Settings,
    app_factory: Callable[ [ Settings ], FastAPI ]
) -> None:
    assert TestClient( app_factory( settings ) ).get( path ).status_code == 404

def make_guarded_client( settings: Settings ) -> TestClient:
    guarded = FastAPI()

    @guarded.get( "/guarded" )
    def read_guarded( _: Annotated[ None, Depends( create_secret_check( settings ) ) ] ) -> dict[ str, bool ]:
        return { "ok": True }

    return TestClient( guarded )

def test_the_secret_check_lets_the_right_secret_through(
    settings: Settings,
    auth_headers: dict[ str, str ]
) -> None:
    response = make_guarded_client( settings ).get( "/guarded", headers = auth_headers )

    assert response.status_code == 200

@pytest.mark.parametrize(
    "headers",
    [
        {},
        { "Authorization": "Bearer wrong" },
        { "Authorization": "Basic " + "s" * 32 },
        { "Authorization": "s" * 32 }
    ]
)
def test_the_secret_check_rejects_everything_else( headers: dict[ str, str ], settings: Settings ) -> None:
    response = make_guarded_client( settings ).get( "/guarded", headers = headers )

    assert response.status_code == 401
    assert response.json() == { "detail": "unauthorized" }

def test_logs_one_line_per_request_without_secrets_or_content(
    settings: Settings,
    app_factory: Callable[ [ Settings ], FastAPI ],
    caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level( logging.INFO, logger = "atlas_agent" )
    client = TestClient( app_factory( settings ) )

    client.post(
        "/health?token=query-sentinel",
        content = "body-sentinel",
        headers = { "Authorization": f"Bearer {settings.agent_secret}" }
    )

    assert len( caplog.records ) == 1
    line = caplog.records[ 0 ].getMessage()

    assert "/health" in line
    assert "405" in line
    assert "ms" in line

    for forbidden in [ settings.agent_secret, settings.claude_auth.key or "", "query-sentinel", "body-sentinel" ]:
        assert forbidden not in caplog.text

def test_importing_main_does_not_read_the_environment( monkeypatch: pytest.MonkeyPatch ) -> None:
    for name in [ "ANTHROPIC_API_KEY", "AGENT_SECRET", "VAULTS_ROOT" ]:
        monkeypatch.delenv( name, raising = False )

    reloaded = importlib.reload( main )

    with pytest.raises( ConfigError, match = "ANTHROPIC_API_KEY" ):
        _ = reloaded.app

def test_the_module_level_app_is_built_from_the_environment(
    monkeypatch: pytest.MonkeyPatch,
    fixture_vault: Path
) -> None:
    monkeypatch.setenv( "ANTHROPIC_API_KEY", "sk-test-key" )
    monkeypatch.setenv( "AGENT_SECRET", "s" * 32 )
    monkeypatch.setenv( "VAULTS_ROOT", str( fixture_vault ) )

    assert TestClient( main.app ).get( "/health" ).status_code == 200

def test_the_module_level_app_uses_the_anthropic_client(
    monkeypatch: pytest.MonkeyPatch,
    fixture_vault: Path
) -> None:
    monkeypatch.setenv( "ANTHROPIC_API_KEY", "sk-test-key" )
    monkeypatch.setenv( "AGENT_SECRET", "s" * 32 )
    monkeypatch.setenv( "VAULTS_ROOT", str( fixture_vault ) )

    assert isinstance( main.app.state.claude, AnthropicClaude )

def test_create_app_keeps_the_claude_client_it_is_given( settings: Settings ) -> None:
    claude = ScriptedClaude( [] )

    assert create_app( settings, claude ).state.claude is claude

def test_the_request_line_is_json_with_the_job_id_from_the_header(
    settings: Settings,
    app_factory: Callable[ [ Settings ], FastAPI ],
    capsys: pytest.CaptureFixture[ str ]
) -> None:
    configure_logging( "info" )
    job_id = "6f1c1f0e-8c1a-4a53-9a47-6a2a5d7c3b10"

    TestClient( app_factory( settings ) ).get( "/health", headers = { "X-Job-Id": job_id } )

    line = json.loads( capsys.readouterr().err.splitlines()[ 0 ] )

    assert line[ "service" ] == "agent"
    assert line[ "job_id" ] == job_id
    assert line[ "method" ] == "GET"
    assert line[ "path" ] == "/health"
    assert line[ "status" ] == 200
    assert "GET /health 200" in line[ "msg" ]

@pytest.mark.parametrize( "header", [ None, "not-a-uuid", "6f1c1f0e-8c1a-4a53-9a47-6a2a5d7c3b10; drop table" ] )
def test_a_missing_or_malformed_job_id_is_not_logged(
    header: str | None,
    settings: Settings,
    app_factory: Callable[ [ Settings ], FastAPI ],
    capsys: pytest.CaptureFixture[ str ]
) -> None:
    configure_logging( "info" )
    headers = {} if header is None else { "X-Job-Id": header }

    TestClient( app_factory( settings ) ).get( "/health", headers = headers )

    assert "job_id" not in json.loads( capsys.readouterr().err.splitlines()[ 0 ] )

from collections.abc import Callable

from fastapi import FastAPI
from fastapi.testclient import TestClient

from atlas_agent.config import Settings
from atlas_agent.linker.instructions import build_instructions

def test_requires_the_secret( settings: Settings, app_factory: Callable[ [ Settings ], FastAPI ] ) -> None:
    client = TestClient( app_factory( settings ) )

    assert client.get( "/v1/link/instructions" ).status_code == 401
    assert client.get( "/v1/link/instructions", headers = { "Authorization": "Bearer wrong" } ).status_code == 401

def test_returns_the_locked_instructions_with_the_configured_limit(
    settings: Settings,
    app_factory: Callable[ [ Settings ], FastAPI ],
    auth_headers: dict[ str, str ]
) -> None:
    limited = settings.model_copy( update = { "max_suggestions": 5 } )
    response = TestClient( app_factory( limited ) ).get( "/v1/link/instructions", headers = auth_headers )

    assert response.status_code == 200
    assert response.json() == { "instructions": build_instructions( 5 ) }
    assert "at most 5 suggestions" in response.json()[ "instructions" ]

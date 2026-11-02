import logging
import shutil
from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI

from atlas_agent.config import Settings
from atlas_agent.main import create_app
from tests.fakes import ScriptedClaude

FIXTURE_VAULT = Path( __file__ ).parent / "fixtures" / "vault"

@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"

@pytest.fixture
def fixture_vault() -> Path:
    return FIXTURE_VAULT

@pytest.fixture
def vault_dir() -> str:
    return "vault"

@pytest.fixture
def vault_copy( tmp_path: Path, vault_dir: str ) -> Path:
    vault = tmp_path / vault_dir
    shutil.copytree( FIXTURE_VAULT, vault )
    return vault

@pytest.fixture
def settings( vault_copy: Path ) -> Settings:
    return Settings( anthropic_api_key = "test-api-key", agent_secret = "s" * 32, vaults_root = vault_copy.parent )

@pytest.fixture
def auth_headers( settings: Settings ) -> dict[ str, str ]:
    return { "Authorization": f"Bearer {settings.agent_secret}" }

@pytest.fixture
def app_factory() -> Callable[ [ Settings ], FastAPI ]:
    return lambda settings: create_app( settings, ScriptedClaude( [] ) )

@pytest.fixture( autouse = True )
def restore_loggers() -> Iterator[ None ]:
    names = [ "atlas_agent", "uvicorn", "uvicorn.access" ]
    saved = [ ( logging.getLogger( name ), list( logging.getLogger( name ).handlers ), logging.getLogger( name ).propagate, logging.getLogger( name ).level ) for name in names ]

    yield

    for logger, handlers, propagate, level in saved:
        logger.handlers = handlers
        logger.propagate = propagate
        logger.setLevel( level )

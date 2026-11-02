import json
import subprocess
import time
import urllib.error
import urllib.request
from collections.abc import Iterator
from pathlib import Path

import pytest

from tests.conftest import FIXTURE_VAULT

pytestmark = pytest.mark.docker

AGENT_PATH = Path( __file__ ).parents[ 2 ]
IMAGE = "atlas-agent:test"
SECRET = "d" * 32

def run_docker( *arguments: str, check: bool = True ) -> subprocess.CompletedProcess[ str ]:
    return subprocess.run( [ "docker", *arguments ], capture_output = True, text = True, check = check )

@pytest.fixture( scope = "module" )
def container() -> Iterator[ str ]:
    run_docker( "build", "--tag", IMAGE, str( AGENT_PATH ) )
    started = run_docker(
        "run",
        "--detach",
        "--read-only",
        "--tmpfs", "/tmp",
        "--publish", "127.0.0.1::8100",
        "--volume", f"{FIXTURE_VAULT}:/vaults/vault:ro",
        "--env", "ANTHROPIC_API_KEY=sk-test-key",
        "--env", f"AGENT_SECRET={SECRET}",
        "--env", "VAULTS_ROOT=/vaults",
        IMAGE
    )
    container_id = started.stdout.strip()

    yield container_id

    run_docker( "rm", "--force", container_id, check = False )

def read_url( container_id: str, path: str, headers: dict[ str, str ] | None = None ) -> tuple[ int, str ]:
    mapping = run_docker( "port", container_id, "8100/tcp" ).stdout.splitlines()[ 0 ]
    request = urllib.request.Request( f"http://{mapping}{path}", headers = headers or {} )

    try:
        with urllib.request.urlopen( request, timeout = 3 ) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode()

def wait_for_health( container_id: str ) -> tuple[ int, str ]:
    deadline = time.monotonic() + 30
    last: tuple[ int, str ] = ( 0, "" )

    while time.monotonic() < deadline:
        try:
            last = read_url( container_id, "/health" )
        except OSError:
            last = ( 0, "" )

        if last[ 0 ] == 200:
            return last

        time.sleep( 0.5 )

    logs = run_docker( "logs", container_id, check = False )
    pytest.fail( f"Agent never became healthy. Last: {last}. Logs: {logs.stdout} {logs.stderr}" )

def test_the_container_is_healthy_with_a_read_only_filesystem( container: str ) -> None:
    status, body = wait_for_health( container )

    assert status == 200
    assert json.loads( body ) == { "status": "ok", "vault": "readable" }

def test_the_link_routes_need_the_secret( container: str ) -> None:
    wait_for_health( container )

    assert read_url( container, "/v1/link/instructions" )[ 0 ] == 401
    assert read_url( container, "/v1/link/instructions", { "Authorization": f"Bearer {SECRET}" } )[ 0 ] == 200

def test_the_vault_cannot_be_written_to( container: str ) -> None:
    wait_for_health( container )

    attempt = run_docker( "exec", container, "python", "-c", "open( '/vaults/vault/x.md', 'w' ).write( 'x' )", check = False )

    assert attempt.returncode != 0
    assert "Read-only file system" in attempt.stderr

def test_the_container_filesystem_is_read_only( container: str ) -> None:
    wait_for_health( container )

    attempt = run_docker( "exec", container, "python", "-c", "open( '/app/x', 'w' ).write( 'x' )", check = False )

    assert attempt.returncode != 0
    assert "Read-only file system" in attempt.stderr

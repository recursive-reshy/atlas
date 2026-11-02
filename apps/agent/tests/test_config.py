from pathlib import Path

import pytest

from atlas_agent.config import ConfigError, load_settings

SECRET = "s" * 32

def make_environ( vault: Path, **overrides: str ) -> dict[ str, str ]:
    environ = { "ANTHROPIC_API_KEY": "sk-test-key", "AGENT_SECRET": SECRET, "VAULTS_ROOT": str( vault ) }
    return { **environ, **overrides }

def test_reads_the_required_variables( fixture_vault: Path ) -> None:
    settings = load_settings( make_environ( fixture_vault ) )

    assert settings.anthropic_api_key == "sk-test-key"
    assert settings.agent_secret == SECRET
    assert settings.vaults_root == fixture_vault

def test_limits_have_the_documented_defaults( fixture_vault: Path ) -> None:
    settings = load_settings( make_environ( fixture_vault ) )

    assert settings.max_turns == 12
    assert settings.max_tool_calls == 24
    assert settings.max_output_tokens == 4096
    assert settings.run_timeout_seconds == 90
    assert settings.max_suggestions == 8
    assert settings.list_notes_limit == 500
    assert settings.search_hits_limit == 20
    assert settings.search_snippet_chars == 200
    assert settings.read_note_chars == 8000
    assert settings.link_targets_limit == 500

def test_limits_can_be_overridden_with_agent_variables( fixture_vault: Path ) -> None:
    settings = load_settings( make_environ( fixture_vault, AGENT_MAX_TURNS = "5", AGENT_RUN_TIMEOUT_SECONDS = "30" ) )

    assert settings.max_turns == 5
    assert settings.run_timeout_seconds == 30

def test_a_missing_api_key_names_the_variable( fixture_vault: Path ) -> None:
    environ = make_environ( fixture_vault )
    del environ[ "ANTHROPIC_API_KEY" ]

    with pytest.raises( ConfigError, match = "ANTHROPIC_API_KEY" ):
        load_settings( environ )

def test_a_short_secret_names_the_variable_and_does_not_echo_it( fixture_vault: Path ) -> None:
    with pytest.raises( ConfigError ) as error:
        load_settings( make_environ( fixture_vault, AGENT_SECRET = "too-short" ) )

    assert "AGENT_SECRET" in str( error.value )
    assert "at least 32 characters" in str( error.value )
    assert "too-short" not in str( error.value )

def test_a_missing_vaults_root_names_the_variable( fixture_vault: Path ) -> None:
    environ = make_environ( fixture_vault )
    del environ[ "VAULTS_ROOT" ]

    with pytest.raises( ConfigError, match = "VAULTS_ROOT" ):
        load_settings( environ )

def test_a_vaults_root_that_is_not_a_directory_names_the_variable( tmp_path: Path ) -> None:
    with pytest.raises( ConfigError, match = "VAULTS_ROOT" ):
        load_settings( make_environ( tmp_path / "nope" ) )

def test_the_old_vault_path_variable_is_not_read( fixture_vault: Path ) -> None:
    environ = make_environ( fixture_vault )
    del environ[ "VAULTS_ROOT" ]

    with pytest.raises( ConfigError, match = "VAULTS_ROOT" ):
        load_settings( { **environ, "VAULT_PATH": str( fixture_vault ) } )

def test_an_invalid_limit_names_the_variable( fixture_vault: Path ) -> None:
    with pytest.raises( ConfigError, match = "AGENT_MAX_TURNS" ):
        load_settings( make_environ( fixture_vault, AGENT_MAX_TURNS = "many" ) )

def test_every_problem_is_reported_together( tmp_path: Path ) -> None:
    with pytest.raises( ConfigError ) as error:
        load_settings( { "AGENT_SECRET": "short", "VAULTS_ROOT": str( tmp_path / "nope" ) } )

    message = str( error.value )

    assert "ANTHROPIC_API_KEY" in message
    assert "AGENT_SECRET" in message
    assert "VAULTS_ROOT" in message

@pytest.mark.parametrize( "name", [ "fatal", "error", "warn", "info", "debug", "trace", "silent" ] )
def test_log_level_accepts_the_server_names( fixture_vault: Path, name: str ) -> None:
    assert load_settings( make_environ( fixture_vault, LOG_LEVEL = name ) ).log_level == name

def test_log_level_defaults_to_info_and_ignores_case_and_empty( fixture_vault: Path ) -> None:
    assert load_settings( make_environ( fixture_vault ) ).log_level == "info"
    assert load_settings( make_environ( fixture_vault, LOG_LEVEL = "" ) ).log_level == "info"
    assert load_settings( make_environ( fixture_vault, LOG_LEVEL = "DEBUG" ) ).log_level == "debug"

def test_an_unknown_log_level_names_the_variable( fixture_vault: Path ) -> None:
    with pytest.raises( ConfigError, match = "LOG_LEVEL" ):
        load_settings( make_environ( fixture_vault, LOG_LEVEL = "loud" ) )

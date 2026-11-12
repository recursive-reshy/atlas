from pathlib import Path

import pytest

from atlas_agent.config import ClaudeAuth, ConfigError, load_settings

SECRET = "s" * 32

def make_environ( vault: Path, **overrides: str ) -> dict[ str, str ]:
    environ = { "ANTHROPIC_API_KEY": "sk-test-key", "AGENT_SECRET": SECRET, "VAULTS_ROOT": str( vault ) }
    return { **environ, **overrides }

def test_reads_the_required_variables( fixture_vault: Path ) -> None:
    settings = load_settings( make_environ( fixture_vault ) )

    assert settings.claude_auth == ClaudeAuth( kind = "api_key", key = "sk-test-key" )
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

FEDERATION_VARIABLES = [
    "ANTHROPIC_FEDERATION_RULE_ID",
    "ANTHROPIC_ORGANIZATION_ID",
    "ANTHROPIC_SERVICE_ACCOUNT_ID",
    "ANTHROPIC_WORKSPACE_ID",
    "ANTHROPIC_IDENTITY_TOKEN_FILE"
]

def make_federation_environ( vault: Path, tmp_path: Path, **overrides: str ) -> dict[ str, str ]:
    token_file = tmp_path / "token"
    token_file.write_text( "header.payload.signature" )
    environ = make_environ( vault )
    del environ[ "ANTHROPIC_API_KEY" ]
    values = { name: f"{name.lower()}-value" for name in FEDERATION_VARIABLES }
    values[ "ANTHROPIC_IDENTITY_TOKEN_FILE" ] = str( token_file )

    return { **environ, **values, **overrides }

def test_neither_a_key_nor_federation_names_both_modes( fixture_vault: Path ) -> None:
    environ = make_environ( fixture_vault )
    del environ[ "ANTHROPIC_API_KEY" ]

    with pytest.raises( ConfigError, match = "ANTHROPIC_API_KEY" ) as error:
        load_settings( environ )

    assert "ANTHROPIC_FEDERATION_RULE_ID" in str( error.value )

def test_federation_is_a_mode_of_its_own( fixture_vault: Path, tmp_path: Path ) -> None:
    settings = load_settings( make_federation_environ( fixture_vault, tmp_path ) )

    assert settings.claude_auth == ClaudeAuth( kind = "federation" )

def test_a_key_beside_a_federation_variable_is_refused( fixture_vault: Path, tmp_path: Path ) -> None:
    environ = make_federation_environ( fixture_vault, tmp_path, ANTHROPIC_API_KEY = "sk-test-key" )

    with pytest.raises( ConfigError, match = "not both" ) as error:
        load_settings( environ )

    assert "ANTHROPIC_FEDERATION_RULE_ID" in str( error.value )
    assert "sk-test-key" not in str( error.value )

def test_an_empty_key_beside_federation_is_refused( fixture_vault: Path, tmp_path: Path ) -> None:
    with pytest.raises( ConfigError, match = "unset it, don't blank it" ):
        load_settings( make_federation_environ( fixture_vault, tmp_path, ANTHROPIC_API_KEY = "" ) )

@pytest.mark.parametrize( "name", FEDERATION_VARIABLES )
def test_partial_federation_names_the_missing_variable( fixture_vault: Path, tmp_path: Path, name: str ) -> None:
    environ = make_federation_environ( fixture_vault, tmp_path )
    del environ[ name ]

    with pytest.raises( ConfigError, match = name ):
        load_settings( environ )

def test_federation_needs_the_token_file_to_exist( fixture_vault: Path, tmp_path: Path ) -> None:
    environ = make_federation_environ(
        fixture_vault, tmp_path, ANTHROPIC_IDENTITY_TOKEN_FILE = str( tmp_path / "missing" )
    )

    with pytest.raises( ConfigError, match = "ANTHROPIC_IDENTITY_TOKEN_FILE does not exist" ):
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

def test_syllabus_limits_have_the_documented_defaults( fixture_vault: Path ) -> None:
    settings = load_settings( make_environ( fixture_vault ) )

    assert settings.syllabus_max_turns == 16
    assert settings.syllabus_max_tool_calls == 40
    assert settings.syllabus_max_output_tokens == 8192
    assert settings.syllabus_timeout_seconds == 180

def test_syllabus_limits_are_read_from_syllabus_variables( fixture_vault: Path ) -> None:
    settings = load_settings(
        make_environ( fixture_vault, SYLLABUS_MAX_TURNS = "4", SYLLABUS_TIMEOUT_SECONDS = "60", AGENT_MAX_TURNS = "7" )
    )

    assert settings.syllabus_max_turns == 4
    assert settings.syllabus_timeout_seconds == 60
    assert settings.max_turns == 7

def test_an_invalid_syllabus_limit_names_the_variable( fixture_vault: Path ) -> None:
    with pytest.raises( ConfigError, match = "SYLLABUS_MAX_TOOL_CALLS" ):
        load_settings( make_environ( fixture_vault, SYLLABUS_MAX_TOOL_CALLS = "0" ) )

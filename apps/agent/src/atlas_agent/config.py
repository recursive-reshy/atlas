from collections.abc import Mapping
from pathlib import Path

from pydantic import BaseModel

from atlas_agent.logging_setup import LOG_LEVELS

SECRET_MINIMUM_LENGTH = 32

LIMIT_DEFAULTS: dict[ str, int ] = {
    "max_turns": 12,
    "max_tool_calls": 24,
    "max_output_tokens": 4096,
    "run_timeout_seconds": 90,
    "max_suggestions": 8,
    "list_notes_limit": 500,
    "search_hits_limit": 20,
    "search_snippet_chars": 200,
    "read_note_chars": 8000,
    "link_targets_limit": 500
}

# Read from SYLLABUS_<NAME without the prefix>, not AGENT_*
SYLLABUS_DEFAULTS: dict[ str, int ] = {
    "syllabus_max_turns": 16,
    "syllabus_max_tool_calls": 40,
    "syllabus_max_output_tokens": 8192,
    "syllabus_timeout_seconds": 180
}

class ConfigError( Exception ):
    pass

class Settings( BaseModel ):
    anthropic_api_key: str
    agent_secret: str
    vaults_root: Path
    log_level: str = "info"
    max_turns: int = LIMIT_DEFAULTS[ "max_turns" ]
    max_tool_calls: int = LIMIT_DEFAULTS[ "max_tool_calls" ]
    max_output_tokens: int = LIMIT_DEFAULTS[ "max_output_tokens" ]
    run_timeout_seconds: int = LIMIT_DEFAULTS[ "run_timeout_seconds" ]
    max_suggestions: int = LIMIT_DEFAULTS[ "max_suggestions" ]
    list_notes_limit: int = LIMIT_DEFAULTS[ "list_notes_limit" ]
    search_hits_limit: int = LIMIT_DEFAULTS[ "search_hits_limit" ]
    search_snippet_chars: int = LIMIT_DEFAULTS[ "search_snippet_chars" ]
    read_note_chars: int = LIMIT_DEFAULTS[ "read_note_chars" ]
    link_targets_limit: int = LIMIT_DEFAULTS[ "link_targets_limit" ]
    syllabus_max_turns: int = SYLLABUS_DEFAULTS[ "syllabus_max_turns" ]
    syllabus_max_tool_calls: int = SYLLABUS_DEFAULTS[ "syllabus_max_tool_calls" ]
    syllabus_max_output_tokens: int = SYLLABUS_DEFAULTS[ "syllabus_max_output_tokens" ]
    syllabus_timeout_seconds: int = SYLLABUS_DEFAULTS[ "syllabus_timeout_seconds" ]

def load_settings( environ: Mapping[ str, str ] ) -> Settings:
    problems: list[ str ] = []
    api_key = environ.get( "ANTHROPIC_API_KEY", "" )
    secret = environ.get( "AGENT_SECRET", "" )
    vaults_value = environ.get( "VAULTS_ROOT", "" )
    log_level = environ.get( "LOG_LEVEL", "" ).lower() or "info"

    if not api_key:
        problems.append( "ANTHROPIC_API_KEY is required" )

    if len( secret ) < SECRET_MINIMUM_LENGTH:
        problems.append( f"AGENT_SECRET is required and must be at least {SECRET_MINIMUM_LENGTH} characters" )

    if not vaults_value:
        problems.append( "VAULTS_ROOT is required" )
    elif not Path( vaults_value ).is_dir():
        problems.append( "VAULTS_ROOT must be an existing directory" )

    if log_level not in LOG_LEVELS:
        problems.append( f"LOG_LEVEL must be one of {', '.join( LOG_LEVELS )}" )

    limits: dict[ str, int ] = {}

    variables = {
        **{ f"AGENT_{name.upper()}": name for name in LIMIT_DEFAULTS },
        **{ name.upper(): name for name in SYLLABUS_DEFAULTS }
    }

    for variable, name in variables.items():

        if variable not in environ:
            continue

        value = environ[ variable ]

        if not value.isdecimal() or int( value ) < 1:
            problems.append( f"{variable} must be a positive whole number" )
            continue

        limits[ name ] = int( value )

    if problems:
        raise ConfigError( f"Invalid configuration: {'; '.join( problems )}" )

    return Settings( anthropic_api_key = api_key, agent_secret = secret, vaults_root = Path( vaults_value ),
        log_level = log_level,
        **limits
    )

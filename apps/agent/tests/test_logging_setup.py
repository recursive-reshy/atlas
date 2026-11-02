import json
import logging

import pytest

from atlas_agent.logging_setup import JsonFormatter, configure_logging, job_id_var

NAMES = [ "atlas_agent", "uvicorn", "uvicorn.access" ]

def format_record( record: logging.LogRecord ) -> dict[ str, object ]:
    return json.loads( JsonFormatter().format( record ) )

def make_record( message: str = "hello", level: int = logging.INFO, **extra: object ) -> logging.LogRecord:
    record = logging.LogRecord( "atlas_agent", level, __file__, 1, message, None, None )
    record.__dict__.update( extra )
    return record

def test_formats_one_json_object_with_the_common_fields() -> None:
    line = format_record( make_record( "hello", logging.WARNING ) )

    assert line[ "level" ] == "warning"
    assert line[ "service" ] == "agent"
    assert line[ "msg" ] == "hello"
    assert str( line[ "time" ] ).endswith( "+00:00" )

def test_adds_extra_fields_and_the_job_id() -> None:
    line = format_record( make_record( outcome = "linked", tool_calls = 3, job_id = "abc" ) )

    assert line[ "outcome" ] == "linked"
    assert line[ "tool_calls" ] == 3
    assert line[ "job_id" ] == "abc"

def test_an_exception_becomes_err() -> None:
    try:
        raise ValueError( "boom" )
    except ValueError:
        import sys

        record = logging.LogRecord( "atlas_agent", logging.ERROR, __file__, 1, "failed", None, sys.exc_info() )

    line = format_record( record )

    assert "ValueError: boom" in str( line[ "err" ] )

def test_the_handler_copies_the_job_id_onto_each_record( capsys: pytest.CaptureFixture[ str ] ) -> None:
    configure_logging( "info" )
    token = job_id_var.set( "job-1" )

    try:
        logging.getLogger( "atlas_agent" ).info( "inside" )
    finally:
        job_id_var.reset( token )

    logging.getLogger( "atlas_agent" ).info( "outside" )
    inside, outside = [ json.loads( line ) for line in capsys.readouterr().err.splitlines() ]

    assert inside[ "job_id" ] == "job-1"
    assert "job_id" not in outside

def test_configuring_twice_leaves_one_handler_per_logger() -> None:
    configure_logging( "info" )
    configure_logging( "debug" )

    for name in NAMES:
        assert len( logging.getLogger( name ).handlers ) == 1

def test_uvicorn_loggers_use_the_json_formatter_and_do_not_propagate() -> None:
    configure_logging( "info" )

    for name in [ "uvicorn", "uvicorn.access" ]:
        logger = logging.getLogger( name )

        assert isinstance( logger.handlers[ 0 ].formatter, JsonFormatter )
        assert logger.propagate is False

@pytest.mark.parametrize(
    ( "name", "expected" ),
    [ ( "debug", logging.DEBUG ), ( "trace", logging.DEBUG ), ( "warn", logging.WARNING ), ( "error", logging.ERROR ), ( "fatal", logging.CRITICAL ) ]
)
def test_the_level_name_sets_the_logger_level( name: str, expected: int ) -> None:
    configure_logging( name )

    assert logging.getLogger( "atlas_agent" ).level == expected

def test_silent_drops_everything( capsys: pytest.CaptureFixture[ str ] ) -> None:
    configure_logging( "silent" )

    logging.getLogger( "atlas_agent" ).critical( "nothing" )

    assert capsys.readouterr().err == ""

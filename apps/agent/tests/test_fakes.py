import time

import pytest

from atlas_agent.claude import ClaudeError, MessageReply, MessageRequest, TextBlock, Usage
from tests.fakes import ScriptedClaude

pytestmark = pytest.mark.anyio

def make_request( model: str = "m" ) -> MessageRequest:
    return MessageRequest( model = model, max_tokens = 10, system = [], tools = [], messages = [] )

def make_reply( text: str ) -> MessageReply:
    return MessageReply( content = [ TextBlock( text = text ) ], stop_reason = "end_turn", usage = Usage() )

async def test_returns_the_queued_replies_in_order() -> None:
    claude = ScriptedClaude( [ make_reply( "one" ), make_reply( "two" ) ] )

    first = await claude.create_message( make_request() )
    second = await claude.create_message( make_request() )

    assert [ first.content, second.content ] == [ [ TextBlock( text = "one" ) ], [ TextBlock( text = "two" ) ] ]

async def test_records_every_request() -> None:
    claude = ScriptedClaude( [ make_reply( "one" ), make_reply( "two" ) ] )

    await claude.create_message( make_request( "first-model" ) )
    await claude.create_message( make_request( "second-model" ) )

    assert [ request.model for request in claude.requests ] == [ "first-model", "second-model" ]

async def test_raises_a_queued_error() -> None:
    claude = ScriptedClaude( [ ClaudeError( 429, "slow down" ) ] )

    with pytest.raises( ClaudeError ) as error:
        await claude.create_message( make_request() )

    assert error.value.status == 429
    assert error.value.message == "slow down"

async def test_fails_loudly_when_the_script_runs_out() -> None:
    claude = ScriptedClaude( [] )

    with pytest.raises( AssertionError, match = "no reply left for request 1" ):
        await claude.create_message( make_request() )

async def test_waits_before_replying_when_given_a_delay() -> None:
    claude = ScriptedClaude( [ make_reply( "slow" ) ], delay_seconds = 0.05 )
    started = time.perf_counter()

    await claude.create_message( make_request() )

    assert time.perf_counter() - started >= 0.05

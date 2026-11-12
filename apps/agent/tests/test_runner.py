from typing import Any

import pytest
from pydantic import BaseModel, Field

from atlas_agent.claude import CacheControl, ClaudeError, MessageReply, MessageRequest, TextBlock, ToolDefinition, ToolResultBlock
from atlas_agent.contract.link import AgentUsage
from atlas_agent.runner import AgentOutcome, AgentRun, AgentSpec, AgentTool, Limits, ToolResult, run_agent
from tests.fakes import ScriptedClaude, text_reply, tool_reply

pytestmark = pytest.mark.anyio

class Answer( BaseModel ):
    answer: str = Field( min_length = 1 )

def make_echo_tool( calls: list[ dict[ str, Any ] ] | None = None ) -> AgentTool:
    def run( arguments: dict[ str, Any ] ) -> ToolResult:
        if calls is not None:
            calls.append( arguments )

        return ToolResult( content = f"echo {arguments.get( 'text' )}" )

    return AgentTool(
        definition = ToolDefinition(
            name = "echo",
            description = "Echo the text.",
            input_schema = { "type": "object", "properties": { "text": { "type": "string" } } }
        ),
        run = run
    )

def make_spec( **overrides: Any ) -> AgentSpec[ Answer ]:
    fields: dict[ str, Any ] = {
        "system_text": "You answer questions.",
        "first_message": "What is 2 + 2?",
        "model": "model-under-test",
        "tools": [ make_echo_tool() ],
        "submit_name": "submit_answer",
        "submit_description": "Submit the answer. This ends the run.",
        "submit_model": Answer,
        "submission_noun": "answers",
        "nudge": "Finish by calling submit_answer.",
        "limits": Limits( max_turns = 5, max_tool_calls = 5, max_output_tokens = 1000, timeout_seconds = 5 )
    }

    return AgentSpec[ Answer ]( **{ **fields, **overrides } )

def submit( answer: str = "four" ) -> Any:
    return tool_reply( ( "submit_answer", { "answer": answer } ) )

class TestAgentRun:
    def test_a_submitted_run_needs_its_submission( self ) -> None:
        with pytest.raises( ValueError, match = "submission" ):
            AgentRun[ Answer ](
                outcome = AgentOutcome.SUBMITTED,
                submission = None,
                reason = None,
                usage = AgentUsage( input_tokens = 0, output_tokens = 0, cache_read_input_tokens = 0, cache_creation_input_tokens = 0, tool_calls = 0, turns = 0 )
            )

    def test_a_failed_run_needs_its_reason( self ) -> None:
        with pytest.raises( ValueError, match = "reason" ):
            AgentRun[ Answer ](
                outcome = AgentOutcome.FAILED,
                submission = None,
                reason = None,
                usage = AgentUsage( input_tokens = 0, output_tokens = 0, cache_read_input_tokens = 0, cache_creation_input_tokens = 0, tool_calls = 0, turns = 0 )
            )

async def test_a_submission_ends_the_run_with_the_validated_model() -> None:
    claude = ScriptedClaude( [ submit() ] )

    run = await run_agent( make_spec(), claude )

    assert run.outcome == AgentOutcome.SUBMITTED
    assert run.submission == Answer( answer = "four" )
    assert run.reason is None
    assert run.usage.turns == 1
    assert run.usage.tool_calls == 1

async def test_sends_the_spec_to_claude() -> None:
    claude = ScriptedClaude( [ submit() ] )

    await run_agent( make_spec(), claude )

    request = claude.requests[ 0 ]

    assert request.model == "model-under-test"
    assert request.max_tokens == 1000
    assert request.system[ 0 ].text == "You answer questions."
    assert request.system[ 0 ].cache_control is not None
    assert [ tool.name for tool in request.tools ] == [ "echo", "submit_answer" ]
    assert request.tools[ -1 ].description == "Submit the answer. This ends the run."
    assert request.tools[ -1 ].input_schema == Answer.model_json_schema()
    assert request.tools[ -1 ].cache_control is not None
    assert request.tools[ 0 ].cache_control is None
    assert request.messages[ 0 ].role == "user"
    assert request.messages[ 0 ].content == [ TextBlock( text = "What is 2 + 2?", cache_control = CacheControl() ) ]

async def test_a_tool_is_run_with_its_arguments_and_its_result_goes_back_to_claude() -> None:
    calls: list[ dict[ str, Any ] ] = []
    claude = ScriptedClaude( [ tool_reply( ( "echo", { "text": "hi" } ) ), submit() ] )

    run = await run_agent( make_spec( tools = [ make_echo_tool( calls ) ] ), claude )

    results = [ block for block in claude.requests[ 1 ].messages[ -1 ].content if isinstance( block, ToolResultBlock ) ]

    assert calls == [ { "text": "hi" } ]
    assert [ ( result.tool_use_id, result.content, result.is_error ) for result in results ] == [ ( "tool-0", "echo hi", False ) ]
    assert run.usage.tool_calls == 2
    assert run.usage.turns == 2

async def test_an_unknown_tool_is_reported_to_claude_and_the_run_continues() -> None:
    claude = ScriptedClaude( [ tool_reply( ( "delete_note", {} ) ), submit() ] )

    run = await run_agent( make_spec(), claude )

    result = claude.requests[ 1 ].messages[ -1 ].content[ 0 ]

    assert isinstance( result, ToolResultBlock )
    assert result.content == "Unknown tool 'delete_note'"
    assert result.is_error is True
    assert run.outcome == AgentOutcome.SUBMITTED

async def test_adds_up_usage_across_every_call() -> None:
    claude = ScriptedClaude( [ tool_reply( ( "echo", {} ) ), submit() ] )

    run = await run_agent( make_spec(), claude )

    assert run.usage == AgentUsage(
        input_tokens = 200,
        output_tokens = 20,
        cache_read_input_tokens = 100,
        cache_creation_input_tokens = 10,
        tool_calls = 2,
        turns = 2
    )

async def test_an_invalid_submission_gets_one_corrective_turn() -> None:
    claude = ScriptedClaude( [ tool_reply( ( "submit_answer", { "answer": "" } ) ), submit() ] )

    run = await run_agent( make_spec(), claude )

    correction = claude.requests[ 1 ].messages[ -1 ].content[ 0 ]

    assert run.outcome == AgentOutcome.SUBMITTED
    assert isinstance( correction, ToolResultBlock )
    assert correction.is_error is True
    assert correction.content.startswith( "Invalid answers (1 errors): answer: " )

async def test_two_invalid_submissions_fail_with_the_error_count() -> None:
    claude = ScriptedClaude( [ tool_reply( ( "submit_answer", { "answer": "" } ) ) ] * 2 )

    run = await run_agent( make_spec(), claude )

    assert run.outcome == AgentOutcome.FAILED
    assert run.submission is None
    assert run.reason == "Answers failed validation twice (1 errors)"
    assert run.usage.turns == 2

async def test_a_reply_without_a_tool_call_gets_one_nudge() -> None:
    claude = ScriptedClaude( [ text_reply( "It is four." ), submit() ] )

    run = await run_agent( make_spec(), claude )

    nudge = claude.requests[ 1 ].messages[ -1 ]

    assert run.outcome == AgentOutcome.SUBMITTED
    assert nudge.role == "user"
    assert nudge.content == [ TextBlock( text = "Finish by calling submit_answer.", cache_control = CacheControl() ) ]

async def test_two_replies_without_a_tool_call_fail() -> None:
    claude = ScriptedClaude( [ text_reply( "Four." ), text_reply( "Still four." ) ] )

    run = await run_agent( make_spec(), claude )

    assert run.outcome == AgentOutcome.FAILED
    assert run.reason == "Claude replied without calling submit_answer (2 turns)"

async def test_stops_at_the_tool_call_limit() -> None:
    limits = Limits( max_turns = 5, max_tool_calls = 2, max_output_tokens = 1000, timeout_seconds = 5 )
    claude = ScriptedClaude( [ tool_reply( ( "echo", {} ) ), tool_reply( ( "echo", {} ) ), tool_reply( ( "echo", {} ) ) ] )

    run = await run_agent( make_spec( limits = limits ), claude )

    assert run.outcome == AgentOutcome.FAILED
    assert run.reason == "Stopped after 2 tool calls (limit 2)"

async def test_stops_inside_a_batch_of_tool_calls_at_the_limit() -> None:
    limits = Limits( max_turns = 5, max_tool_calls = 1, max_output_tokens = 1000, timeout_seconds = 5 )
    claude = ScriptedClaude( [ tool_reply( ( "echo", {} ), ( "echo", {} ) ) ] )

    run = await run_agent( make_spec( limits = limits ), claude )

    assert run.reason == "Stopped after 1 tool calls (limit 1)"

async def test_stops_at_the_turn_limit() -> None:
    limits = Limits( max_turns = 2, max_tool_calls = 10, max_output_tokens = 1000, timeout_seconds = 5 )
    claude = ScriptedClaude( [ tool_reply( ( "echo", {} ) ), tool_reply( ( "echo", {} ) ) ] )

    run = await run_agent( make_spec( limits = limits ), claude )

    assert run.outcome == AgentOutcome.FAILED
    assert run.reason == "Stopped after 2 turns (limit 2)"

async def test_times_out_and_keeps_the_usage_so_far() -> None:
    limits = Limits( max_turns = 5, max_tool_calls = 5, max_output_tokens = 1000, timeout_seconds = 1 )
    claude = ScriptedClaude( [ tool_reply( ( "echo", {} ) ), submit() ], delay_seconds = 0.6 )

    run = await run_agent( make_spec( limits = limits ), claude )

    assert run.outcome == AgentOutcome.FAILED
    assert run.reason == "Timed out after 1 s"
    assert run.usage.turns == 1

async def test_an_api_error_fails_with_the_status_and_message() -> None:
    run = await run_agent( make_spec(), ScriptedClaude( [ ClaudeError( 529, "Overloaded" ) ] ) )

    assert run.outcome == AgentOutcome.FAILED
    assert run.reason == "Claude API error 529: Overloaded"

async def test_an_api_error_without_a_status_leaves_the_status_out() -> None:
    run = await run_agent( make_spec(), ScriptedClaude( [ ClaudeError( None, "Connection refused" ) ] ) )

    assert run.reason == "Claude API error: Connection refused"

async def test_only_the_submit_is_acted_on_when_it_comes_with_other_tool_calls() -> None:
    calls: list[ dict[ str, Any ] ] = []
    claude = ScriptedClaude( [ tool_reply( ( "echo", { "text": "x" } ), ( "submit_answer", { "answer": "four" } ) ) ] )

    run = await run_agent( make_spec( tools = [ make_echo_tool( calls ) ] ), claude )

    assert run.outcome == AgentOutcome.SUBMITTED
    assert calls == []

def message_breakpoints( request: MessageRequest ) -> list[ tuple[ int, int ] ]:
    return [
        ( message_index, block_index )
        for message_index, message in enumerate( request.messages )
        for block_index, block in enumerate( message.content )
        if getattr( block, "cache_control", None ) is not None
    ]

def count_breakpoints( request: MessageRequest ) -> int:
    system = sum( 1 for block in request.system if block.cache_control is not None )
    tools = sum( 1 for tool in request.tools if tool.cache_control is not None )

    return system + tools + len( message_breakpoints( request ) )

async def test_the_newest_user_message_carries_the_only_message_breakpoint_on_every_turn() -> None:
    claude = ScriptedClaude(
        [ tool_reply( ( "echo", {} ) ), tool_reply( ( "echo", {} ), ( "echo", {} ) ), tool_reply( ( "echo", {} ) ), submit() ]
    )

    await run_agent( make_spec(), claude )

    assert len( claude.requests ) == 4

    for request in claude.requests:
        newest = len( request.messages ) - 1

        assert request.messages[ newest ].role == "user"
        assert message_breakpoints( request ) == [ ( newest, len( request.messages[ newest ].content ) - 1 ) ]

async def test_the_first_request_marks_the_first_message_and_later_ones_move_on() -> None:
    claude = ScriptedClaude( [ tool_reply( ( "echo", {} ) ), submit() ] )

    await run_agent( make_spec(), claude )

    assert message_breakpoints( claude.requests[ 0 ] ) == [ ( 0, 0 ) ]
    assert message_breakpoints( claude.requests[ 1 ] ) == [ ( 2, 0 ) ]

async def test_a_request_never_has_more_than_four_breakpoints() -> None:
    script: list[ MessageReply | ClaudeError ] = [ *[ tool_reply( ( "echo", {} ) ) ] * 4, submit() ]
    claude = ScriptedClaude( script )

    await run_agent( make_spec(), claude )

    assert [ count_breakpoints( request ) for request in claude.requests ] == [ 3 ] * 5

async def test_a_nudge_and_a_correction_are_marked_like_any_newest_user_message() -> None:
    claude = ScriptedClaude( [ text_reply( "Four." ), tool_reply( ( "submit_answer", { "answer": "" } ) ), submit() ] )

    await run_agent( make_spec(), claude )

    assert [ message_breakpoints( request ) for request in claude.requests ] == [ [ ( 0, 0 ) ], [ ( 2, 0 ) ], [ ( 4, 0 ) ] ]

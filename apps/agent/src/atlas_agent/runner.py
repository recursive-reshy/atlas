import asyncio
from collections.abc import Callable
from enum import StrEnum
from typing import Any, Self

from pydantic import BaseModel, ValidationError, model_validator

from atlas_agent.claude import (
    CacheControl,
    ClaudeClient,
    ClaudeError,
    Message,
    MessageRequest,
    SystemBlock,
    TextBlock,
    ToolDefinition,
    ToolResultBlock,
    ToolUseBlock
)
from atlas_agent.contract.link import AgentUsage

class Limits( BaseModel ):
    max_turns: int
    max_tool_calls: int
    max_output_tokens: int
    timeout_seconds: int | float

class ToolResult( BaseModel ):
    content: str
    is_error: bool = False

class AgentTool( BaseModel ):
    definition: ToolDefinition
    run: Callable[ [ dict[ str, Any ] ], ToolResult ]

class AgentSpec[ SubmitT: BaseModel ]( BaseModel ):
    system_text: str
    first_message: str
    model: str
    tools: list[ AgentTool ]
    submit_name: str
    submit_description: str
    submit_model: type[ SubmitT ]
    submission_noun: str
    nudge: str
    limits: Limits

class AgentOutcome( StrEnum ):
    SUBMITTED = "submitted"
    FAILED = "failed"

class AgentRun[ SubmitT: BaseModel ]( BaseModel ):
    outcome: AgentOutcome
    submission: SubmitT | None
    reason: str | None
    usage: AgentUsage

    @model_validator( mode = "after" )
    def check_outcome( self ) -> Self:
        if self.outcome == AgentOutcome.SUBMITTED and self.submission is None:
            raise ValueError( "submission is required when outcome is submitted" )

        if self.outcome == AgentOutcome.FAILED and not self.reason:
            raise ValueError( "reason is required when outcome is failed" )

        return self

class RunState( BaseModel ):
    turns: int = 0
    tool_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0

def build_failure( reason: str, state: RunState ) -> AgentRun[ Any ]:
    return AgentRun[ Any ](
        outcome = AgentOutcome.FAILED,
        submission = None,
        reason = reason,
        usage = AgentUsage( **state.model_dump() )
    )

def describe_validation_errors( error: ValidationError, noun: str ) -> str:
    details = [ f"{'.'.join( str( part ) for part in item[ 'loc' ] )}: {item[ 'msg' ]}" for item in error.errors() ]

    return f"Invalid {noun} ({error.error_count()} errors): {'; '.join( details )}"

async def converse[ SubmitT: BaseModel ](
    spec: AgentSpec[ SubmitT ],
    claude: ClaudeClient,
    state: RunState
) -> AgentRun[ SubmitT ]:
    tools_by_name = { tool.definition.name: tool for tool in spec.tools }
    submit_tool = ToolDefinition(
        name = spec.submit_name,
        description = spec.submit_description,
        input_schema = spec.submit_model.model_json_schema()
    )
    definitions = [ *[ tool.definition for tool in spec.tools ], submit_tool ]
    definitions[ -1 ].cache_control = CacheControl()
    messages = [ Message( role = "user", content = [ TextBlock( text = spec.first_message ) ] ) ]
    invalid_submissions = 0
    replies_without_tools = 0

    while True:
        if state.turns >= spec.limits.max_turns:
            return build_failure( f"Stopped after {state.turns} turns (limit {spec.limits.max_turns})", state )

        try:
            reply = await claude.create_message(
                MessageRequest(
                    model = spec.model,
                    max_tokens = spec.limits.max_output_tokens,
                    system = [ SystemBlock( text = spec.system_text, cache_control = CacheControl() ) ],
                    tools = definitions,
                    messages = messages
                )
            )
        except ClaudeError as exception:
            status = f" {exception.status}" if exception.status is not None else ""

            return build_failure( f"Claude API error{status}: {exception.message}", state )

        state.turns += 1
        state.input_tokens += reply.usage.input_tokens
        state.output_tokens += reply.usage.output_tokens
        state.cache_read_input_tokens += reply.usage.cache_read_input_tokens
        state.cache_creation_input_tokens += reply.usage.cache_creation_input_tokens
        messages.append( Message( role = "assistant", content = [ *reply.content ] ) )
        tool_uses = [ block for block in reply.content if isinstance( block, ToolUseBlock ) ]

        if not tool_uses:
            replies_without_tools += 1

            if replies_without_tools == 2:
                return build_failure(
                    f"Claude replied without calling {spec.submit_name} ({state.turns} turns)",
                    state
                )

            messages.append( Message( role = "user", content = [ TextBlock( text = spec.nudge ) ] ) )
            continue

        submit = next( ( block for block in tool_uses if block.name == spec.submit_name ), None )

        if submit is not None:
            state.tool_calls += 1

            try:
                submission = spec.submit_model.model_validate( submit.input )
            except ValidationError as error:
                invalid_submissions += 1

                if invalid_submissions == 2:
                    return build_failure(
                        f"{spec.submission_noun.capitalize()} failed validation twice ({error.error_count()} errors)",
                        state
                    )

                correction = ToolResultBlock(
                    tool_use_id = submit.id,
                    content = describe_validation_errors( error, spec.submission_noun ),
                    is_error = True
                )
                messages.append( Message( role = "user", content = [ correction ] ) )
                continue

            return AgentRun[ SubmitT ](
                outcome = AgentOutcome.SUBMITTED,
                submission = submission,
                reason = None,
                usage = AgentUsage( **state.model_dump() )
            )

        results: list[ ToolResultBlock ] = []

        for tool_use in tool_uses:
            if state.tool_calls >= spec.limits.max_tool_calls:
                return build_failure(
                    f"Stopped after {state.tool_calls} tool calls (limit {spec.limits.max_tool_calls})",
                    state
                )

            state.tool_calls += 1
            tool = tools_by_name.get( tool_use.name )
            result = (
                tool.run( tool_use.input )
                if tool is not None
                else ToolResult( content = f"Unknown tool '{tool_use.name}'", is_error = True )
            )
            results.append(
                ToolResultBlock( tool_use_id = tool_use.id, content = result.content, is_error = result.is_error )
            )

        messages.append( Message( role = "user", content = [ *results ] ) )

async def run_agent[ SubmitT: BaseModel ]( spec: AgentSpec[ SubmitT ], claude: ClaudeClient ) -> AgentRun[ SubmitT ]:
    state = RunState()

    try:
        async with asyncio.timeout( spec.limits.timeout_seconds ):
            return await converse( spec, claude, state )
    except TimeoutError:
        return build_failure( f"Timed out after {spec.limits.timeout_seconds} s", state )

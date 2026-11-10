import asyncio
from pathlib import Path

from pydantic import BaseModel, ValidationError

from atlas_agent.claude import (
    CacheControl,
    ClaudeClient,
    ClaudeError,
    Message,
    MessageRequest,
    SystemBlock,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock
)
from atlas_agent.config import Settings
from atlas_agent.contract.link import (
    AgentUsage,
    FailedLinkResponse,
    LinkedResponse,
    LinkOutcome,
    LinkRequest
)
from atlas_agent.linker.checks import apply_checks
from atlas_agent.linker.instructions import build_instructions
from atlas_agent.linker.tools import SubmitSuggestions, ToolResult, build_tool_definitions, run_vault_tool
from atlas_agent.vault.links import collect_link_targets
from atlas_agent.vault.notes import list_all_notes
from atlas_agent.vault.paths import vault_for

SUBMIT_TOOL_NAME = "submit_suggestions"

class RunState( BaseModel ):
    turns: int = 0
    tool_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0

def build_usage( state: RunState ) -> AgentUsage:
    return AgentUsage( **state.model_dump() )

def build_failure( reason: str, state: RunState ) -> FailedLinkResponse:
    return FailedLinkResponse( outcome = LinkOutcome.FAILED, reason = reason, suggestions = [], usage = build_usage( state ) )

def describe_validation_errors( error: ValidationError ) -> str:
    details = [ f"{'.'.join( str( part ) for part in item[ 'loc' ] )}: {item[ 'msg' ]}" for item in error.errors() ]

    return f"Invalid suggestions ({error.error_count()} errors): {'; '.join( details )}"

async def converse(
    request: LinkRequest,
    settings: Settings,
    claude: ClaudeClient,
    state: RunState,
    vault: Path
) -> LinkedResponse | FailedLinkResponse:
    system_text = build_instructions( settings.max_suggestions )

    if request.guidance.strip():
        system_text = f"{system_text}\n\n## Guidance\n\n{request.guidance}"

    tools = build_tool_definitions()
    tools[ -1 ].cache_control = CacheControl()
    note = request.note
    note_body = "\n".join(
        [
            f"Title: {note.title}",
            f"Tags: {', '.join( note.tags ) if note.tags else '(none)'}",
            f"Folder: {note.folder or '(default)'}",
            "",
            "## Body",
            "",
            note.body
        ]
    )
    # A closing tag inside the note must not end the block early (TRD 3.3)
    note_text = f"<source_content>\n{note_body.replace( '</source_content>', '</source_content_>' )}\n</source_content>"
    messages = [ Message( role = "user", content = [ TextBlock( text = note_text ) ] ) ]
    invalid_submissions = 0
    replies_without_tools = 0

    while True:
        if state.turns >= settings.max_turns:
            return build_failure( f"Stopped after {state.turns} turns (limit {settings.max_turns})", state )

        try:
            reply = await claude.create_message(
                MessageRequest(
                    model = request.model,
                    max_tokens = settings.max_output_tokens,
                    system = [ SystemBlock( text = system_text, cache_control = CacheControl() ) ],
                    tools = tools,
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
                    f"Claude replied without calling {SUBMIT_TOOL_NAME} ({state.turns} turns)",
                    state
                )

            nudge = f"Finish by calling {SUBMIT_TOOL_NAME} with your suggestions, or an empty list if none fit."
            messages.append( Message( role = "user", content = [ TextBlock( text = nudge ) ] ) )
            continue

        submit = next( ( block for block in tool_uses if block.name == SUBMIT_TOOL_NAME ), None )

        if submit is not None:
            state.tool_calls += 1

            try:
                submitted = SubmitSuggestions.model_validate( submit.input )
            except ValidationError as error:
                invalid_submissions += 1

                if invalid_submissions == 2:
                    return build_failure( f"Suggestions failed validation twice ({error.error_count()} errors)", state )

                correction = ToolResultBlock(
                    tool_use_id = submit.id,
                    content = describe_validation_errors( error ),
                    is_error = True
                )
                messages.append( Message( role = "user", content = [ correction ] ) )
                continue

            suggestions = apply_checks(
                submitted.suggestions,
                note,
                list_all_notes( vault ),
                collect_link_targets( vault ),
                settings
            )

            return LinkedResponse(
                outcome = LinkOutcome.LINKED,
                reason = None,
                suggestions = suggestions,
                usage = build_usage( state )
            )

        results: list[ ToolResultBlock ] = []

        for tool_use in tool_uses:
            if state.tool_calls >= settings.max_tool_calls:
                return build_failure(
                    f"Stopped after {state.tool_calls} tool calls (limit {settings.max_tool_calls})",
                    state
                )

            state.tool_calls += 1
            result: ToolResult = run_vault_tool( tool_use.name, tool_use.input, settings, vault )
            results.append(
                ToolResultBlock( tool_use_id = tool_use.id, content = result.content, is_error = result.is_error )
            )

        messages.append( Message( role = "user", content = [ *results ] ) )

async def run_linker( request: LinkRequest, settings: Settings, claude: ClaudeClient ) -> LinkedResponse | FailedLinkResponse:
    vault = vault_for( settings, request.vault_dir )
    state = RunState()

    try:
        async with asyncio.timeout( settings.run_timeout_seconds ):
            return await converse( request, settings, claude, state, vault )
    except TimeoutError:
        return build_failure( f"Timed out after {settings.run_timeout_seconds} s", state )

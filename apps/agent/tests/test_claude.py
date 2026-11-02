import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx2
import pytest

from atlas_agent.claude import (
    AnthropicClaude,
    CacheControl,
    ClaudeError,
    Message,
    MessageRequest,
    SystemBlock,
    TextBlock,
    ToolDefinition,
    ToolResultBlock,
    ToolUseBlock
)

pytestmark = pytest.mark.anyio

SOURCE_PATH = Path( __file__ ).parents[ 1 ] / "src"

def make_claude( handler: Callable[ [ httpx2.Request ], httpx2.Response ] ) -> AnthropicClaude:
    return AnthropicClaude( "sk-test-key", http_client = httpx2.AsyncClient( transport = httpx2.MockTransport( handler ) ) )

def make_request() -> MessageRequest:
    return MessageRequest(
        model = "model-under-test",
        max_tokens = 256,
        system = [ SystemBlock( text = "Be helpful", cache_control = CacheControl() ) ],
        tools = [
            ToolDefinition(
                name = "list_notes",
                description = "List notes",
                input_schema = { "type": "object", "properties": {} },
                cache_control = CacheControl()
            )
        ],
        messages = [
            Message( role = "user", content = [ TextBlock( text = "Link this" ) ] ),
            Message( role = "assistant", content = [ ToolUseBlock( id = "tool-1", name = "list_notes", input = {} ) ] ),
            Message(
                role = "user",
                content = [ ToolResultBlock( tool_use_id = "tool-1", content = "boom", is_error = True ) ]
            )
        ]
    )

def message_body( **overrides: Any ) -> dict[ str, Any ]:
    body: dict[ str, Any ] = {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": "model-under-test",
        "content": [ { "type": "text", "text": "Hello" } ],
        "stop_reason": "end_turn",
        "stop_sequence": None,
        "usage": { "input_tokens": 10, "output_tokens": 5 }
    }
    return { **body, **overrides }

async def test_sends_the_request_with_cache_control_and_tool_blocks() -> None:
    sent: list[ dict[ str, Any ] ] = []

    def handler( request: httpx2.Request ) -> httpx2.Response:
        sent.append( json.loads( request.content ) )
        return httpx2.Response( 200, json = message_body() )

    await make_claude( handler ).create_message( make_request() )

    body = sent[ 0 ]

    assert body[ "model" ] == "model-under-test"
    assert body[ "max_tokens" ] == 256
    assert body[ "system" ] == [ { "type": "text", "text": "Be helpful", "cache_control": { "type": "ephemeral" } } ]
    assert body[ "tools" ][ 0 ][ "name" ] == "list_notes"
    assert body[ "tools" ][ 0 ][ "input_schema" ] == { "type": "object", "properties": {} }
    assert body[ "tools" ][ 0 ][ "cache_control" ] == { "type": "ephemeral" }
    assert body[ "messages" ][ 1 ][ "content" ] == [
        { "type": "tool_use", "id": "tool-1", "name": "list_notes", "input": {} }
    ]
    assert body[ "messages" ][ 2 ][ "content" ] == [
        { "type": "tool_result", "tool_use_id": "tool-1", "content": "boom", "is_error": True }
    ]

async def test_maps_text_and_tool_use_blocks_and_usage_with_cache_counts() -> None:
    reply_body = message_body(
        content = [
            { "type": "text", "text": "Looking" },
            { "type": "tool_use", "id": "tool-9", "name": "search_vault", "input": { "query": "pricing" } }
        ],
        stop_reason = "tool_use",
        usage = {
            "input_tokens": 100,
            "output_tokens": 20,
            "cache_read_input_tokens": 70,
            "cache_creation_input_tokens": 30
        }
    )

    reply = await make_claude( lambda _: httpx2.Response( 200, json = reply_body ) ).create_message( make_request() )

    assert reply.content == [
        TextBlock( text = "Looking" ),
        ToolUseBlock( id = "tool-9", name = "search_vault", input = { "query": "pricing" } )
    ]
    assert reply.stop_reason == "tool_use"
    assert reply.usage.input_tokens == 100
    assert reply.usage.output_tokens == 20
    assert reply.usage.cache_read_input_tokens == 70
    assert reply.usage.cache_creation_input_tokens == 30

async def test_missing_cache_counts_are_zero() -> None:
    reply = await make_claude( lambda _: httpx2.Response( 200, json = message_body() ) ).create_message( make_request() )

    assert reply.usage.cache_read_input_tokens == 0
    assert reply.usage.cache_creation_input_tokens == 0

@pytest.mark.parametrize( "status", [ 429, 500 ] )
async def test_api_errors_become_claude_errors_with_the_status_and_message( status: int ) -> None:
    error_body = { "type": "error", "error": { "type": "api_error", "message": "slow down" } }
    claude = make_claude( lambda _: httpx2.Response( status, json = error_body ) )

    with pytest.raises( ClaudeError ) as error:
        await claude.create_message( make_request() )

    assert error.value.status == status
    assert "slow down" in error.value.message

async def test_connection_failures_become_claude_errors_without_a_status() -> None:
    def handler( request: httpx2.Request ) -> httpx2.Response:
        raise httpx2.ConnectError( "no route", request = request )

    with pytest.raises( ClaudeError ) as error:
        await make_claude( handler ).create_message( make_request() )

    assert error.value.status is None

def test_only_claude_py_imports_anthropic() -> None:
    importers = [
        path.name
        for path in SOURCE_PATH.rglob( "*.py" )
        if "import anthropic" in path.read_text() or "from anthropic" in path.read_text()
    ]

    assert importers == [ "claude.py" ]

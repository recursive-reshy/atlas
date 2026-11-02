from typing import Any, Literal, Protocol

import anthropic
import httpx2
from anthropic.types import Message as AnthropicMessage
from pydantic import BaseModel

class ClaudeError( Exception ):
    def __init__( self, status: int | None, message: str ) -> None:
        super().__init__( message )
        self.status = status
        self.message = message

class CacheControl( BaseModel ):
    type: Literal[ "ephemeral" ] = "ephemeral"

class SystemBlock( BaseModel ):
    type: Literal[ "text" ] = "text"
    text: str
    cache_control: CacheControl | None = None

class ToolDefinition( BaseModel ):
    name: str
    description: str
    input_schema: dict[ str, Any ]
    cache_control: CacheControl | None = None

class TextBlock( BaseModel ):
    type: Literal[ "text" ] = "text"
    text: str

class ToolUseBlock( BaseModel ):
    type: Literal[ "tool_use" ] = "tool_use"
    id: str
    name: str
    input: dict[ str, Any ]

class ToolResultBlock( BaseModel ):
    type: Literal[ "tool_result" ] = "tool_result"
    tool_use_id: str
    content: str
    is_error: bool = False

class Message( BaseModel ):
    role: Literal[ "user", "assistant" ]
    content: list[ TextBlock | ToolUseBlock | ToolResultBlock ]

class MessageRequest( BaseModel ):
    model: str
    max_tokens: int
    system: list[ SystemBlock ]
    tools: list[ ToolDefinition ]
    messages: list[ Message ]

class Usage( BaseModel ):
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0

class MessageReply( BaseModel ):
    content: list[ TextBlock | ToolUseBlock ]
    stop_reason: str | None
    usage: Usage

class ClaudeClient( Protocol ):
    async def create_message( self, request: MessageRequest ) -> MessageReply: ...

class AnthropicClaude:
    def __init__(
        self,
        api_key: str,
        http_client: httpx2.AsyncClient | None = None,
        max_retries: int = 0
    ) -> None:
        self.client = anthropic.AsyncAnthropic( api_key = api_key, http_client = http_client, max_retries = max_retries )

    async def create_message( self, request: MessageRequest ) -> MessageReply:
        payload: dict[ str, Any ] = request.model_dump( mode = "json", exclude_none = True )

        try:
            response: AnthropicMessage = await self.client.messages.create( **payload, stream = False )
        except anthropic.APIStatusError as exception:
            raise ClaudeError( exception.status_code, exception.message ) from exception
        except anthropic.APIError as exception:
            raise ClaudeError( None, exception.message ) from exception

        content: list[ TextBlock | ToolUseBlock ] = []

        for block in response.content:
            if block.type == "text":
                content.append( TextBlock( text = block.text ) )

            if block.type == "tool_use":
                content.append( ToolUseBlock( id = block.id, name = block.name, input = dict( block.input ) ) )

        return MessageReply(
            content = content,
            stop_reason = response.stop_reason,
            usage = Usage(
                input_tokens = response.usage.input_tokens,
                output_tokens = response.usage.output_tokens,
                cache_read_input_tokens = response.usage.cache_read_input_tokens or 0,
                cache_creation_input_tokens = response.usage.cache_creation_input_tokens or 0
            )
        )

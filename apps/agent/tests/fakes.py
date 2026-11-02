import asyncio
from typing import Any

from atlas_agent.claude import ClaudeError, MessageReply, MessageRequest, TextBlock, ToolUseBlock, Usage

class ScriptedClaude:
    def __init__( self, script: list[ MessageReply | ClaudeError ], delay_seconds: float = 0 ) -> None:
        self.script = list( script )
        self.delay_seconds = delay_seconds
        self.requests: list[ MessageRequest ] = []

    async def create_message( self, request: MessageRequest ) -> MessageReply:
        self.requests.append( request )
        await asyncio.sleep( self.delay_seconds )

        if not self.script:
            raise AssertionError( f"ScriptedClaude has no reply left for request {len( self.requests )}" )

        next_item = self.script.pop( 0 )

        if isinstance( next_item, ClaudeError ):
            raise next_item

        return next_item

def make_usage() -> Usage:
    return Usage( input_tokens = 100, output_tokens = 10, cache_read_input_tokens = 50, cache_creation_input_tokens = 5 )

def text_reply( text: str ) -> MessageReply:
    return MessageReply( content = [ TextBlock( text = text ) ], stop_reason = "end_turn", usage = make_usage() )

def tool_reply( *calls: tuple[ str, dict[ str, Any ] ] ) -> MessageReply:
    return MessageReply(
        content = [ ToolUseBlock( id = f"tool-{index}", name = name, input = arguments ) for index, ( name, arguments ) in enumerate( calls ) ],
        stop_reason = "tool_use",
        usage = make_usage()
    )

def submit_reply( suggestions: list[ dict[ str, Any ] ] ) -> MessageReply:
    return tool_reply( ( "submit_suggestions", { "suggestions": suggestions } ) )

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, Field, RootModel

class SuggestionKind( StrEnum ):
    EXISTING_NOTE = "existing_note"
    EXISTING_CONCEPT = "existing_concept"
    NEW_CONCEPT = "new_concept"

class LinkOutcome( StrEnum ):
    LINKED = "linked"
    FAILED = "failed"

class LinkNote( BaseModel ):
    title: str = Field( min_length = 1, max_length = 300 )
    tags: list[ str ] = Field( max_length = 50 )
    folder: str | None
    body: str = Field( min_length = 1, max_length = 200_000 )

VAULT_DIR_PATTERN = r"^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$"

class LinkRequest( BaseModel ):
    note: LinkNote
    vault_dir: str = Field( pattern = VAULT_DIR_PATTERN )
    model: str = Field( min_length = 1 )
    guidance: str = Field( max_length = 20_000 )

class LinkSuggestion( BaseModel ):
    target: str = Field( min_length = 1, max_length = 200 )
    kind: SuggestionKind
    anchor: str | None
    reason: str = Field( min_length = 1, max_length = 300 )

class AgentUsage( BaseModel ):
    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int
    cache_creation_input_tokens: int
    tool_calls: int
    turns: int

class LinkedResponse( BaseModel ):
    outcome: Literal[ LinkOutcome.LINKED ]
    reason: None
    suggestions: list[ LinkSuggestion ]
    usage: AgentUsage

class FailedLinkResponse( BaseModel ):
    outcome: Literal[ LinkOutcome.FAILED ]
    reason: str = Field( min_length = 1 )
    suggestions: list[ LinkSuggestion ] = Field( max_length = 0 )
    usage: AgentUsage

class LinkResponse( RootModel[ Annotated[ LinkedResponse | FailedLinkResponse, Field( discriminator = "outcome" ) ] ] ):
    pass

class InstructionsResponse( BaseModel ):
    instructions: str

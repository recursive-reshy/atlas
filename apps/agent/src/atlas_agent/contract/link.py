from enum import StrEnum
from typing import Self

from pydantic import BaseModel, Field, model_validator

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

class LinkUsage( BaseModel ):
    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int
    cache_creation_input_tokens: int
    tool_calls: int
    turns: int

class LinkResponse( BaseModel ):
    outcome: LinkOutcome
    reason: str | None
    suggestions: list[ LinkSuggestion ]
    usage: LinkUsage

    @model_validator( mode = "after" )
    def check_outcome( self ) -> Self:
        if self.outcome == LinkOutcome.LINKED and self.reason is not None:
            raise ValueError( "reason must be null when outcome is linked" )

        if self.outcome == LinkOutcome.FAILED and not self.reason:
            raise ValueError( "reason is required when outcome is failed" )

        if self.outcome == LinkOutcome.FAILED and self.suggestions:
            raise ValueError( "suggestions must be empty when outcome is failed" )

        return self

class InstructionsResponse( BaseModel ):
    instructions: str

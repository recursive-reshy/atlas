from pydantic import BaseModel, Field

class SubmittedSuggestion( BaseModel ):
    target: str = Field( min_length = 1, max_length = 200 )
    anchor: str | None = None
    reason: str = Field( min_length = 1, max_length = 300 )

class SubmitSuggestions( BaseModel ):
    suggestions: list[ SubmittedSuggestion ]

from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import BaseModel, Field, RootModel, model_validator

from atlas_agent.contract.link import VAULT_DIR_PATTERN, AgentUsage

MAX_SECTIONS = 20
MAX_CONCEPTS = 100

# Relative, forward slashes, no empty or dot-leading segment: so no `..`, no leading `/`, no hidden folder
SUBJECT_FOLDER_PATTERN = r"^[^/\\.][^/\\]*(/[^/\\.][^/\\]*)*$"

class TargetLevel( StrEnum ):
    AWARENESS = "awareness"
    WORKING = "working"
    PROFICIENT = "proficient"
    EXPERT = "expert"

class SyllabusOutcome( StrEnum ):
    DRAFTED = "drafted"
    FAILED = "failed"

class SyllabusRequest( BaseModel ):
    vault_dir: str = Field( pattern = VAULT_DIR_PATTERN )
    subject_folder: str = Field( min_length = 1, max_length = 500, pattern = SUBJECT_FOLDER_PATTERN )
    name: str = Field( min_length = 1, max_length = 200 )
    level: TargetLevel
    intent: str | None = Field( max_length = 2000 )
    model: str = Field( min_length = 1 )
    guidance: str = Field( max_length = 20_000 )

class SyllabusConcept( BaseModel ):
    name: str = Field( min_length = 1, max_length = 200 )
    description: str = Field( max_length = 500 )

class SyllabusSection( BaseModel ):
    name: str = Field( max_length = 200 )
    concepts: list[ SyllabusConcept ]

class DraftedSyllabus( BaseModel ):
    outcome: Literal[ SyllabusOutcome.DRAFTED ]
    reason: None
    sections: list[ SyllabusSection ] = Field( max_length = MAX_SECTIONS )
    usage: AgentUsage

    # Across sections, which JSON Schema cannot say: the Zod mirror leaves this to the agent
    @model_validator( mode = "after" )
    def limit_concepts( self ) -> Self:
        if sum( len( section.concepts ) for section in self.sections ) > MAX_CONCEPTS:
            raise ValueError( f"A syllabus has at most {MAX_CONCEPTS} concepts" )

        return self

class FailedSyllabus( BaseModel ):
    outcome: Literal[ SyllabusOutcome.FAILED ]
    reason: str = Field( min_length = 1 )
    usage: AgentUsage

class SyllabusResponse( RootModel[ Annotated[ DraftedSyllabus | FailedSyllabus, Field( discriminator = "outcome" ) ] ] ):
    pass

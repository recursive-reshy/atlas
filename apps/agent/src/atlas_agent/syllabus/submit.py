from typing import Self

from pydantic import BaseModel, Field, model_validator

from atlas_agent.contract.syllabus import MAX_CONCEPTS, MAX_SECTIONS, SyllabusSection

# What the model submits. The limits are the contract's, so a draft that would not fit the response is
# corrected in the run instead of failing at the end.
class SubmitSyllabus( BaseModel ):
    sections: list[ SyllabusSection ] = Field( max_length = MAX_SECTIONS )

    @model_validator( mode = "after" )
    def limit_concepts( self ) -> Self:
        if sum( len( section.concepts ) for section in self.sections ) > MAX_CONCEPTS:
            raise ValueError( f"A syllabus has at most {MAX_CONCEPTS} concepts" )

        return self

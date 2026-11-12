import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel
from pydantic.json_schema import models_json_schema

from atlas_agent.contract.link import (
    AgentUsage,
    FailedLinkResponse,
    InstructionsResponse,
    LinkedResponse,
    LinkNote,
    LinkRequest,
    LinkResponse,
    LinkSuggestion
)
from atlas_agent.contract.syllabus import (
    DraftedSyllabus,
    FailedSyllabus,
    SyllabusConcept,
    SyllabusRequest,
    SyllabusResponse,
    SyllabusSection
)

SCHEMA_PATH = Path( __file__ ).parents[ 3 ] / "schema" / "link_contract.json"

SYLLABUS_SCHEMA_PATH = SCHEMA_PATH.with_name( "syllabus_contract.json" )

def build_schema() -> str:
    request_models: list[ type[ BaseModel ] ] = [ LinkNote, LinkRequest ]
    response_models: list[ type[ BaseModel ] ] = [
        LinkSuggestion,
        AgentUsage,
        LinkedResponse,
        FailedLinkResponse,
        LinkResponse,
        InstructionsResponse
    ]

    return render( request_models, response_models, [] )

# AgentUsage belongs to the link file; the generator refuses a definition in two files, so this one refers to it
def build_syllabus_schema() -> str:
    request_models: list[ type[ BaseModel ] ] = [ SyllabusRequest ]
    response_models: list[ type[ BaseModel ] ] = [
        SyllabusConcept,
        SyllabusSection,
        DraftedSyllabus,
        FailedSyllabus,
        SyllabusResponse
    ]

    return render( request_models, response_models, [ "AgentUsage" ] )

def render(
    request_models: list[ type[ BaseModel ] ],
    response_models: list[ type[ BaseModel ] ],
    shared: list[ str ]
) -> str:
    models: list[ tuple[ type[ BaseModel ], Literal[ "validation", "serialization" ] ] ] = [
        *[ ( model, "validation" ) for model in request_models ],
        *[ ( model, "serialization" ) for model in response_models ]
    ]
    _, schema = models_json_schema( models )
    definitions = { name: body for name, body in schema[ "$defs" ].items() if name not in shared }

    return json.dumps( { "$defs": definitions }, indent = 2, sort_keys = True ) + "\n"

if __name__ == "__main__":
    SCHEMA_PATH.parent.mkdir( exist_ok = True )
    SCHEMA_PATH.write_text( build_schema() )
    SYLLABUS_SCHEMA_PATH.write_text( build_syllabus_schema() )

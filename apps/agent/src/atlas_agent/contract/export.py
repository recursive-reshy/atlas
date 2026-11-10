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

SCHEMA_PATH = Path( __file__ ).parents[ 3 ] / "schema" / "link_contract.json"

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
    models: list[ tuple[ type[ BaseModel ], Literal[ "validation", "serialization" ] ] ] = [
        *[ ( model, "validation" ) for model in request_models ],
        *[ ( model, "serialization" ) for model in response_models ]
    ]
    _, schema = models_json_schema( models )
    definitions = schema[ "$defs" ]

    return json.dumps( { "$defs": definitions }, indent = 2, sort_keys = True ) + "\n"

if __name__ == "__main__":
    SCHEMA_PATH.parent.mkdir( exist_ok = True )
    SCHEMA_PATH.write_text( build_schema() )

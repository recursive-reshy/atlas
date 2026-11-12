from typing import Any

import pytest
from pydantic import ValidationError

from atlas_agent.contract.syllabus import (
    DraftedSyllabus,
    FailedSyllabus,
    SyllabusRequest,
    SyllabusResponse,
    TargetLevel
)

def make_request( **overrides: Any ) -> dict[ str, Any ]:
    request: dict[ str, Any ] = {
        "vault_dir": "naresh",
        "subject_folder": "Learning/Rust",
        "name": "Rust",
        "level": "working",
        "intent": None,
        "model": "m",
        "guidance": ""
    }
    return { **request, **overrides }

def make_usage() -> dict[ str, int ]:
    return {
        "input_tokens": 10,
        "output_tokens": 5,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
        "tool_calls": 1,
        "turns": 2
    }

def make_concept( **overrides: Any ) -> dict[ str, Any ]:
    return { "name": "Ownership", "description": "Who frees a value.", **overrides }

def make_drafted( **overrides: Any ) -> dict[ str, Any ]:
    drafted: dict[ str, Any ] = {
        "outcome": "drafted",
        "reason": None,
        "sections": [ { "name": "Basics", "concepts": [ make_concept() ] } ],
        "usage": make_usage()
    }
    return { **drafted, **overrides }

class TestSyllabusRequest:
    def test_accepts_a_valid_request( self ) -> None:
        request = SyllabusRequest.model_validate( make_request() )

        assert request.level == TargetLevel.WORKING

    @pytest.mark.parametrize( "level", [ "awareness", "working", "proficient", "expert" ] )
    def test_accepts_every_level( self, level: str ) -> None:
        SyllabusRequest.model_validate( make_request( level = level ) )

    def test_rejects_an_unknown_level( self ) -> None:
        with pytest.raises( ValidationError ):
            SyllabusRequest.model_validate( make_request( level = "guru" ) )

    @pytest.mark.parametrize( "length", [ 1, 200 ] )
    def test_accepts_name_within_limits( self, length: int ) -> None:
        SyllabusRequest.model_validate( make_request( name = "a" * length ) )

    @pytest.mark.parametrize( "length", [ 0, 201 ] )
    def test_rejects_name_outside_limits( self, length: int ) -> None:
        with pytest.raises( ValidationError ):
            SyllabusRequest.model_validate( make_request( name = "a" * length ) )

    def test_limits_intent_to_two_thousand( self ) -> None:
        SyllabusRequest.model_validate( make_request( intent = "a" * 2000 ) )

        with pytest.raises( ValidationError ):
            SyllabusRequest.model_validate( make_request( intent = "a" * 2001 ) )

    def test_limits_guidance_to_twenty_thousand( self ) -> None:
        SyllabusRequest.model_validate( make_request( guidance = "a" * 20_000 ) )

        with pytest.raises( ValidationError ):
            SyllabusRequest.model_validate( make_request( guidance = "a" * 20_001 ) )

    @pytest.mark.parametrize( "folder", [ "Rust", "Learning/Rust", "Notes.v2/Rust 101", "a/b/c" ] )
    def test_accepts_relative_subject_folders( self, folder: str ) -> None:
        SyllabusRequest.model_validate( make_request( subject_folder = folder ) )

    @pytest.mark.parametrize(
        "folder",
        [ "", "/Rust", "../Rust", "Learning/../Rust", "..", "Learning/..", "Learning//Rust", "Learning/", ".hidden", "a\\b" ]
    )
    def test_rejects_unsafe_subject_folders( self, folder: str ) -> None:
        with pytest.raises( ValidationError ):
            SyllabusRequest.model_validate( make_request( subject_folder = folder ) )

    def test_rejects_a_bad_vault_dir( self ) -> None:
        with pytest.raises( ValidationError ):
            SyllabusRequest.model_validate( make_request( vault_dir = "../x" ) )

class TestSyllabusResponse:
    def test_accepts_a_drafted_response( self ) -> None:
        response = SyllabusResponse.model_validate( make_drafted() )

        assert isinstance( response.root, DraftedSyllabus )

    def test_accepts_a_failed_response( self ) -> None:
        response = SyllabusResponse.model_validate( { "outcome": "failed", "reason": "Timed out", "usage": make_usage() } )

        assert isinstance( response.root, FailedSyllabus )

    def test_rejects_a_drafted_response_with_a_reason( self ) -> None:
        with pytest.raises( ValidationError ):
            SyllabusResponse.model_validate( make_drafted( reason = "x" ) )

    def test_rejects_a_failed_response_without_a_reason( self ) -> None:
        with pytest.raises( ValidationError ):
            SyllabusResponse.model_validate( { "outcome": "failed", "usage": make_usage() } )

    def test_rejects_a_failed_response_with_an_empty_reason( self ) -> None:
        with pytest.raises( ValidationError ):
            SyllabusResponse.model_validate( { "outcome": "failed", "reason": "", "usage": make_usage() } )

    def test_rejects_an_empty_concept_name( self ) -> None:
        with pytest.raises( ValidationError ):
            SyllabusResponse.model_validate(
                make_drafted( sections = [ { "name": "B", "concepts": [ make_concept( name = "" ) ] } ] )
            )

    def test_limits_a_description_to_five_hundred( self ) -> None:
        SyllabusResponse.model_validate(
            make_drafted( sections = [ { "name": "B", "concepts": [ make_concept( description = "a" * 500 ) ] } ] )
        )

        with pytest.raises( ValidationError ):
            SyllabusResponse.model_validate(
                make_drafted( sections = [ { "name": "B", "concepts": [ make_concept( description = "a" * 501 ) ] } ] )
            )

    def test_limits_a_section_name_to_two_hundred( self ) -> None:
        with pytest.raises( ValidationError ):
            SyllabusResponse.model_validate(
                make_drafted( sections = [ { "name": "a" * 201, "concepts": [ make_concept() ] } ] )
            )

    def test_limits_sections_to_twenty( self ) -> None:
        section = { "name": "S", "concepts": [ make_concept() ] }

        SyllabusResponse.model_validate( make_drafted( sections = [ section ] * 20 ) )

        with pytest.raises( ValidationError ):
            SyllabusResponse.model_validate( make_drafted( sections = [ section ] * 21 ) )

    def test_limits_concepts_to_one_hundred_across_sections( self ) -> None:
        section = { "name": "S", "concepts": [ make_concept() ] * 50 }

        SyllabusResponse.model_validate( make_drafted( sections = [ section ] * 2 ) )

        with pytest.raises( ValidationError ):
            SyllabusResponse.model_validate( make_drafted( sections = [ section ] * 2 + [ { "name": "T", "concepts": [ make_concept() ] } ] ) )

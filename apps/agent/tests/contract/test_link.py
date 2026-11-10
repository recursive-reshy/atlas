import json
from typing import Any

import pytest
from pydantic import ValidationError

from atlas_agent.contract.link import (
    AgentUsage,
    FailedLinkResponse,
    InstructionsResponse,
    LinkedResponse,
    LinkNote,
    LinkOutcome,
    LinkRequest,
    LinkResponse,
    LinkSuggestion,
    SuggestionKind
)

def make_note( **overrides: Any ) -> dict[ str, Any ]:
    note: dict[ str, Any ] = { "title": "Pricing", "tags": [ "saas" ], "folder": "Ideas", "body": "Body text" }
    return { **note, **overrides }

def make_request( **overrides: Any ) -> dict[ str, Any ]:
    request: dict[ str, Any ] = { "note": make_note(), "vault_dir": "naresh", "model": "m", "guidance": "" }
    return { **request, **overrides }

def make_suggestion( **overrides: Any ) -> dict[ str, Any ]:
    suggestion: dict[ str, Any ] = {
        "target": "Pricing Strategy",
        "kind": "new_concept",
        "anchor": None,
        "reason": "The note is about pricing."
    }
    return { **suggestion, **overrides }

def make_usage() -> dict[ str, int ]:
    return {
        "input_tokens": 10,
        "output_tokens": 5,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
        "tool_calls": 1,
        "turns": 2
    }

def make_response( **overrides: Any ) -> dict[ str, Any ]:
    response: dict[ str, Any ] = {
        "outcome": "linked",
        "reason": None,
        "suggestions": [ make_suggestion() ],
        "usage": make_usage()
    }
    return { **response, **overrides }

class TestLinkNote:
    @pytest.mark.parametrize( "length", [ 1, 300 ] )
    def test_accepts_title_within_limits( self, length: int ) -> None:
        assert LinkNote.model_validate( make_note( title = "a" * length ) ).title == "a" * length

    @pytest.mark.parametrize( "length", [ 0, 301 ] )
    def test_rejects_title_outside_limits( self, length: int ) -> None:
        with pytest.raises( ValidationError ):
            LinkNote.model_validate( make_note( title = "a" * length ) )

    def test_limits_tags_to_fifty( self ) -> None:
        LinkNote.model_validate( make_note( tags = [ "t" ] * 50 ) )

        with pytest.raises( ValidationError ):
            LinkNote.model_validate( make_note( tags = [ "t" ] * 51 ) )

    @pytest.mark.parametrize( "length", [ 1, 200_000 ] )
    def test_accepts_body_within_limits( self, length: int ) -> None:
        LinkNote.model_validate( make_note( body = "a" * length ) )

    @pytest.mark.parametrize( "length", [ 0, 200_001 ] )
    def test_rejects_body_outside_limits( self, length: int ) -> None:
        with pytest.raises( ValidationError ):
            LinkNote.model_validate( make_note( body = "a" * length ) )

    def test_accepts_null_folder( self ) -> None:
        assert LinkNote.model_validate( make_note( folder = None ) ).folder is None

    def test_requires_the_folder_key( self ) -> None:
        note = make_note()
        del note[ "folder" ]

        with pytest.raises( ValidationError ):
            LinkNote.model_validate( note )

class TestLinkRequest:
    def test_accepts_a_valid_request( self ) -> None:
        request = LinkRequest.model_validate( make_request() )

        assert request.note.title == "Pricing"
        assert request.vault_dir == "naresh"

    def test_rejects_an_empty_model( self ) -> None:
        with pytest.raises( ValidationError ):
            LinkRequest.model_validate( make_request( model = "" ) )

    def test_limits_guidance_to_twenty_thousand_characters( self ) -> None:
        LinkRequest.model_validate( make_request( guidance = "a" * 20_000 ) )

        with pytest.raises( ValidationError ):
            LinkRequest.model_validate( make_request( guidance = "a" * 20_001 ) )

    def test_validates_the_nested_note( self ) -> None:
        with pytest.raises( ValidationError ):
            LinkRequest.model_validate( make_request( note = make_note( body = "" ) ) )

    def test_requires_a_vault_dir( self ) -> None:
        request = make_request()
        del request[ "vault_dir" ]

        with pytest.raises( ValidationError ):
            LinkRequest.model_validate( request )

    @pytest.mark.parametrize( "vault_dir", [ "a", "naresh", "my-vault-2", "a" * 40 ] )
    def test_accepts_a_vault_folder_name( self, vault_dir: str ) -> None:
        assert LinkRequest.model_validate( make_request( vault_dir = vault_dir ) ).vault_dir == vault_dir

    @pytest.mark.parametrize(
        "vault_dir",
        [ "", "..", "../x", "a/b", "/abs", "UPPER", "has space", ".hidden", "-lead", "trail-", "a" * 41 ]
    )
    def test_rejects_anything_that_is_not_a_vault_folder_name( self, vault_dir: str ) -> None:
        with pytest.raises( ValidationError ):
            LinkRequest.model_validate( make_request( vault_dir = vault_dir ) )

class TestLinkSuggestion:
    def test_accepts_every_kind( self ) -> None:
        for kind in SuggestionKind:
            assert LinkSuggestion.model_validate( make_suggestion( kind = kind.value ) ).kind == kind

    def test_rejects_an_unknown_kind( self ) -> None:
        with pytest.raises( ValidationError ):
            LinkSuggestion.model_validate( make_suggestion( kind = "stub" ) )

    @pytest.mark.parametrize( ( "field", "limit" ), [ ( "target", 200 ), ( "reason", 300 ) ] )
    def test_limits_text_fields( self, field: str, limit: int ) -> None:
        LinkSuggestion.model_validate( make_suggestion( **{ field: "a" * limit } ) )

        for length in [ 0, limit + 1 ]:
            with pytest.raises( ValidationError ):
                LinkSuggestion.model_validate( make_suggestion( **{ field: "a" * length } ) )

    def test_accepts_a_null_anchor_but_requires_the_key( self ) -> None:
        assert LinkSuggestion.model_validate( make_suggestion( anchor = None ) ).anchor is None

        suggestion = make_suggestion()
        del suggestion[ "anchor" ]

        with pytest.raises( ValidationError ):
            LinkSuggestion.model_validate( suggestion )

class TestAgentUsage:
    def test_accepts_all_six_counts( self ) -> None:
        assert AgentUsage.model_validate( make_usage() ).turns == 2

    @pytest.mark.parametrize( "field", list( make_usage() ) )
    def test_requires_every_count( self, field: str ) -> None:
        usage = make_usage()
        del usage[ field ]

        with pytest.raises( ValidationError ):
            AgentUsage.model_validate( usage )

class TestLinkResponse:
    def test_accepts_linked_with_suggestions( self ) -> None:
        response = LinkResponse.model_validate( make_response() ).root

        assert isinstance( response, LinkedResponse )
        assert response.outcome == LinkOutcome.LINKED
        assert len( response.suggestions ) == 1

    def test_accepts_linked_with_no_suggestions( self ) -> None:
        assert LinkResponse.model_validate( make_response( suggestions = [] ) ).root.suggestions == []

    def test_accepts_failed_with_a_reason_and_no_suggestions( self ) -> None:
        response = LinkResponse.model_validate(
            make_response( outcome = "failed", reason = "Timed out after 90 s", suggestions = [] )
        ).root

        assert isinstance( response, FailedLinkResponse )
        assert response.reason == "Timed out after 90 s"

    def test_rejects_failed_without_a_reason( self ) -> None:
        with pytest.raises( ValidationError, match = "reason" ):
            LinkResponse.model_validate( make_response( outcome = "failed", suggestions = [] ) )

    def test_rejects_failed_with_an_empty_reason( self ) -> None:
        with pytest.raises( ValidationError, match = "reason" ):
            LinkResponse.model_validate( make_response( outcome = "failed", reason = "", suggestions = [] ) )

    def test_rejects_failed_with_suggestions( self ) -> None:
        with pytest.raises( ValidationError, match = "suggestions" ):
            LinkResponse.model_validate( make_response( outcome = "failed", reason = "Timed out" ) )

    def test_rejects_linked_with_a_reason( self ) -> None:
        with pytest.raises( ValidationError, match = "reason" ):
            LinkResponse.model_validate( make_response( reason = "Because" ) )

    @pytest.mark.parametrize( "field", [ "outcome", "reason", "suggestions", "usage" ] )
    def test_requires_every_key( self, field: str ) -> None:
        response = make_response()
        del response[ field ]

        with pytest.raises( ValidationError ):
            LinkResponse.model_validate( response )

    def test_a_linked_response_still_serialises_reason_as_null( self ) -> None:
        response = LinkedResponse.model_validate( make_response() )

        assert json.loads( response.model_dump_json() )[ "reason" ] is None
        assert list( json.loads( response.model_dump_json() ) ) == [ "outcome", "reason", "suggestions", "usage" ]

class TestInstructionsResponse:
    def test_round_trips( self ) -> None:
        response = InstructionsResponse.model_validate( { "instructions": "Do the thing" } )

        assert response.model_dump() == { "instructions": "Do the thing" }

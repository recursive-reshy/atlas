from pathlib import Path
from typing import Any

import pytest

from atlas_agent.claude import ClaudeError, MessageRequest, TextBlock, ToolResultBlock
from atlas_agent.config import Settings
from atlas_agent.contract.syllabus import DraftedSyllabus, FailedSyllabus, SyllabusRequest, TargetLevel
from atlas_agent.syllabus.instructions import LOCKED_INSTRUCTIONS
from atlas_agent.syllabus.run import run_syllabus
from atlas_agent.vault.paths import UnknownVaultError
from tests.fakes import ScriptedClaude, text_reply, tool_reply

pytestmark = pytest.mark.anyio

SECTIONS = [ { "name": "Pricing", "concepts": [ { "name": "Usage-Based Pricing", "description": "Charge by use." } ] } ]

def make_request( **overrides: Any ) -> SyllabusRequest:
    request: dict[ str, Any ] = {
        "vault_dir": "vault",
        "subject_folder": "Ideas",
        "name": "Pricing",
        "level": TargetLevel.WORKING,
        "intent": "Price my own product",
        "model": "model-under-test",
        "guidance": ""
    }
    return SyllabusRequest.model_validate( { **request, **overrides } )

def submit( sections: list[ dict[ str, Any ] ] ) -> Any:
    return tool_reply( ( "submit_syllabus", { "sections": sections } ) )

def tool_results( request: MessageRequest ) -> list[ ToolResultBlock ]:
    return [ block for block in request.messages[ -1 ].content if isinstance( block, ToolResultBlock ) ]

async def test_a_list_read_submit_run_is_drafted( settings: Settings ) -> None:
    claude = ScriptedClaude(
        [
            tool_reply( ( "list_notes", {} ) ),
            tool_reply( ( "read_note", { "path": "Pricing Playbook.md" } ) ),
            submit( SECTIONS )
        ]
    )

    response = await run_syllabus( make_request(), settings, claude )

    assert isinstance( response, DraftedSyllabus )
    assert response.reason is None
    assert response.sections[ 0 ].concepts[ 0 ].name == "Usage-Based Pricing"
    assert response.usage.turns == 3
    assert response.usage.tool_calls == 3
    assert "Pricing Playbook" in tool_results( claude.requests[ 2 ] )[ 0 ].content

async def test_an_empty_folder_still_drafts( settings: Settings, vault_copy: Path ) -> None:
    ( vault_copy / "Empty" ).mkdir()

    response = await run_syllabus( make_request( subject_folder = "Empty" ), settings, ScriptedClaude( [ submit( SECTIONS ) ] ) )

    assert isinstance( response, DraftedSyllabus )

async def test_an_invalid_submission_gets_one_corrective_turn( settings: Settings ) -> None:
    bad = [ { "name": "Pricing", "concepts": [ { "name": "", "description": "x" } ] } ]
    claude = ScriptedClaude( [ submit( bad ), submit( SECTIONS ) ] )

    response = await run_syllabus( make_request(), settings, claude )

    assert isinstance( response, DraftedSyllabus )
    assert tool_results( claude.requests[ 1 ] )[ 0 ].content.startswith( "Invalid syllabus (1 errors)" )

async def test_a_submission_over_the_concept_limit_is_invalid( settings: Settings ) -> None:
    section = { "name": "S", "concepts": [ { "name": "C", "description": "" } ] * 50 }
    claude = ScriptedClaude( [ submit( [ section ] * 3 ), submit( SECTIONS ) ] )

    response = await run_syllabus( make_request(), settings, claude )

    assert isinstance( response, DraftedSyllabus )
    assert "at most 100 concepts" in tool_results( claude.requests[ 1 ] )[ 0 ].content

async def test_two_invalid_submissions_fail( settings: Settings ) -> None:
    claude = ScriptedClaude( [ tool_reply( ( "submit_syllabus", { "sections": "no" } ) ), tool_reply( ( "submit_syllabus", { "sections": "no" } ) ) ] )
    response = await run_syllabus( make_request(), settings, claude )

    assert isinstance( response, FailedSyllabus )
    assert response.reason == "Syllabus failed validation twice (1 errors)"

async def test_a_folder_that_does_not_exist_fails_before_claude_is_called( settings: Settings ) -> None:
    claude = ScriptedClaude( [] )
    response = await run_syllabus( make_request( subject_folder = "Nope" ), settings, claude )

    assert isinstance( response, FailedSyllabus )
    assert response.reason == "Subject folder not found"
    assert response.usage.turns == 0
    assert claude.requests == []

async def test_a_note_is_not_a_subject_folder( settings: Settings ) -> None:
    response = await run_syllabus( make_request( subject_folder = "Index.md" ), settings, ScriptedClaude( [] ) )

    assert isinstance( response, FailedSyllabus )
    assert response.reason == "Subject folder not found"

async def test_a_symlink_out_of_the_vault_is_not_a_subject_folder( settings: Settings, vault_copy: Path, tmp_path: Path ) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    ( vault_copy / "Link" ).symlink_to( outside )

    response = await run_syllabus( make_request( subject_folder = "Link" ), settings, ScriptedClaude( [] ) )

    assert isinstance( response, FailedSyllabus )
    assert response.reason == "Subject folder not found"

async def test_an_unknown_vault_is_refused_before_claude_is_called( settings: Settings ) -> None:
    claude = ScriptedClaude( [] )

    with pytest.raises( UnknownVaultError ):
        await run_syllabus( make_request( vault_dir = "nobody" ), settings, claude )

    assert claude.requests == []

async def test_the_tools_see_only_the_subject_folder( settings: Settings ) -> None:
    claude = ScriptedClaude(
        [
            tool_reply( ( "list_notes", {} ), ( "read_note", { "path": "../Reading/Unit Economics.md" } ), ( "read_note", { "path": "Pricing Playbook.md" } ) ),
            tool_reply( ( "search_vault", { "query": "contribution margin" } ) ),
            submit( SECTIONS )
        ]
    )

    await run_syllabus( make_request(), settings, claude )

    listed, escaped, own = tool_results( claude.requests[ 1 ] )
    assert "Developer Tools" in listed.content
    assert "Unit Economics" not in listed.content
    assert "Index" not in listed.content
    assert escaped.is_error
    assert "outside the vault" in escaped.content
    assert not own.is_error
    assert tool_results( claude.requests[ 2 ] )[ 0 ].content == '{"hits":[],"omitted":0}'

async def test_only_the_three_reading_tools_and_submit_are_offered( settings: Settings ) -> None:
    claude = ScriptedClaude( [ submit( SECTIONS ) ] )

    await run_syllabus( make_request(), settings, claude )

    assert [ tool.name for tool in claude.requests[ 0 ].tools ] == [ "list_notes", "search_vault", "read_note", "submit_syllabus" ]

async def test_the_system_prompt_is_the_instructions_then_the_guidance( settings: Settings ) -> None:
    claude = ScriptedClaude( [ submit( SECTIONS ) ] )

    await run_syllabus( make_request( guidance = "Favour practice." ), settings, claude )

    assert claude.requests[ 0 ].system[ 0 ].text == f"{LOCKED_INSTRUCTIONS}\n\n## Guidance\n\nFavour practice."
    assert claude.requests[ 0 ].model == "model-under-test"

async def test_leaves_out_the_guidance_heading_when_there_is_none( settings: Settings ) -> None:
    claude = ScriptedClaude( [ submit( SECTIONS ) ] )

    await run_syllabus( make_request( guidance = " " ), settings, claude )

    assert claude.requests[ 0 ].system[ 0 ].text == LOCKED_INSTRUCTIONS

async def test_the_first_message_names_the_subject_level_and_intent( settings: Settings ) -> None:
    claude = ScriptedClaude( [ submit( SECTIONS ) ] )

    await run_syllabus( make_request( level = TargetLevel.EXPERT ), settings, claude )

    block = claude.requests[ 0 ].messages[ 0 ].content[ 0 ]
    text = block.text if isinstance( block, TextBlock ) else ""
    assert text.splitlines()[ : 3 ] == [ "Subject: Pricing", "Target level: Expert", "Intent: Price my own product" ]
    assert "tools" in text.splitlines()[ -1 ]

async def test_the_first_message_leaves_out_a_missing_intent( settings: Settings ) -> None:
    claude = ScriptedClaude( [ submit( SECTIONS ) ] )

    await run_syllabus( make_request( intent = None ), settings, claude )

    block = claude.requests[ 0 ].messages[ 0 ].content[ 0 ]
    assert "Intent" not in ( block.text if isinstance( block, TextBlock ) else "" )

async def test_stops_at_the_syllabus_turn_limit( settings: Settings ) -> None:
    limited = settings.model_copy( update = { "syllabus_max_turns": 2, "max_turns": 99 } )
    claude = ScriptedClaude( [ tool_reply( ( "list_notes", {} ) ), tool_reply( ( "list_notes", {} ) ) ] )

    response = await run_syllabus( make_request(), limited, claude )

    assert isinstance( response, FailedSyllabus )
    assert response.reason == "Stopped after 2 turns (limit 2)"

async def test_stops_at_the_syllabus_tool_call_limit( settings: Settings ) -> None:
    limited = settings.model_copy( update = { "syllabus_max_tool_calls": 1, "max_tool_calls": 99 } )
    claude = ScriptedClaude( [ tool_reply( ( "list_notes", {} ), ( "list_notes", {} ) ) ] )

    response = await run_syllabus( make_request(), limited, claude )

    assert isinstance( response, FailedSyllabus )
    assert "limit 1" in response.reason

async def test_times_out_at_the_syllabus_timeout( settings: Settings ) -> None:
    limited = settings.model_copy( update = { "syllabus_timeout_seconds": 0.05, "run_timeout_seconds": 99 } )
    claude = ScriptedClaude( [ submit( SECTIONS ) ], delay_seconds = 1 )

    response = await run_syllabus( make_request(), limited, claude )

    assert isinstance( response, FailedSyllabus )
    assert response.reason.startswith( "Timed out after" )

async def test_reserves_the_output_token_limit_for_the_syllabus( settings: Settings ) -> None:
    limited = settings.model_copy( update = { "syllabus_max_output_tokens": 123, "max_output_tokens": 9 } )
    claude = ScriptedClaude( [ submit( SECTIONS ) ] )

    await run_syllabus( make_request(), limited, claude )

    assert claude.requests[ 0 ].max_tokens == 123

async def test_an_api_error_is_a_failed_response( settings: Settings ) -> None:
    response = await run_syllabus( make_request(), settings, ScriptedClaude( [ ClaudeError( 529, "overloaded" ) ] ) )

    assert isinstance( response, FailedSyllabus )
    assert "overloaded" in response.reason

async def test_a_reply_without_a_tool_call_twice_fails( settings: Settings ) -> None:
    response = await run_syllabus( make_request(), settings, ScriptedClaude( [ text_reply( "Here" ), text_reply( "Here" ) ] ) )

    assert isinstance( response, FailedSyllabus )
    assert "submit_syllabus" in response.reason

async def test_never_writes_to_the_vault( settings: Settings, vault_copy: Path ) -> None:
    before = sorted( ( path, path.stat().st_mtime_ns ) for path in vault_copy.rglob( "*" ) )

    await run_syllabus( make_request(), settings, ScriptedClaude( [ tool_reply( ( "list_notes", {} ) ), submit( SECTIONS ) ] ) )

    assert sorted( ( path, path.stat().st_mtime_ns ) for path in vault_copy.rglob( "*" ) ) == before

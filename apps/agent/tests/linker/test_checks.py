from atlas_agent.config import Settings
from atlas_agent.contract.link import LinkNote, LinkSuggestion, SuggestionKind
from atlas_agent.linker.checks import apply_checks
from atlas_agent.linker.tools import SubmittedSuggestion
from atlas_agent.vault.links import LinkTarget
from atlas_agent.vault.notes import NoteSummary

NOTE = LinkNote(
    title = "Pricing a developer tool",
    tags = [],
    folder = None,
    body = "Usage-based pricing aligns cost with value. Talk to users early."
)

NOTES = [
    NoteSummary( path = "Ideas/Pricing Playbook.md", title = "Pricing Playbook", tags = [] ),
    NoteSummary( path = "Reading/Unit Economics.md", title = "Unit Economics", tags = [] ),
    NoteSummary( path = "Reading/Thinking Fast and Slow.md", title = "Thinking, Fast and Slow", tags = [] )
]

LINK_TARGETS = [
    LinkTarget( target = "Customer Discovery", uses = 3, has_note = False ),
    LinkTarget( target = "Unit Economics", uses = 2, has_note = True )
]

def submit( target: str, anchor: str | None = None, reason: str = "Relevant." ) -> SubmittedSuggestion:
    return SubmittedSuggestion( target = target, anchor = anchor, reason = reason )

def check( submitted: list[ SubmittedSuggestion ], settings: Settings ) -> list[ LinkSuggestion ]:
    return apply_checks( submitted, NOTE, NOTES, LINK_TARGETS, settings )

def test_drops_blank_targets_and_trims_and_collapses_whitespace( settings: Settings ) -> None:
    result = check( [ submit( "   " ), submit( "  Free \t  Tier  " ) ], settings )

    assert [ suggestion.target for suggestion in result ] == [ "Free Tier" ]

def test_a_note_title_is_an_existing_note_with_the_title_casing( settings: Settings ) -> None:
    result = check( [ submit( "pricing playbook" ) ], settings )

    assert result[ 0 ].target == "Pricing Playbook"
    assert result[ 0 ].kind == SuggestionKind.EXISTING_NOTE

def test_a_note_file_stem_is_an_existing_note_rewritten_to_the_title( settings: Settings ) -> None:
    result = check( [ submit( "thinking fast and slow" ) ], settings )

    assert result[ 0 ].target == "Thinking, Fast and Slow"
    assert result[ 0 ].kind == SuggestionKind.EXISTING_NOTE

def test_an_existing_link_target_without_a_note_is_an_existing_concept( settings: Settings ) -> None:
    result = check( [ submit( "customer DISCOVERY" ) ], settings )

    assert result[ 0 ].target == "Customer Discovery"
    assert result[ 0 ].kind == SuggestionKind.EXISTING_CONCEPT

def test_an_unknown_target_is_a_new_concept_kept_as_given( settings: Settings ) -> None:
    result = check( [ submit( "Free Tier" ) ], settings )

    assert result[ 0 ].target == "Free Tier"
    assert result[ 0 ].kind == SuggestionKind.NEW_CONCEPT

def test_a_note_match_wins_over_a_link_target_match( settings: Settings ) -> None:
    result = check( [ submit( "unit economics" ) ], settings )

    assert result[ 0 ].kind == SuggestionKind.EXISTING_NOTE

def test_a_kind_sent_by_the_model_is_not_needed_or_trusted( settings: Settings ) -> None:
    submitted = SubmittedSuggestion.model_validate( { "target": "Free Tier", "reason": "Why", "kind": "existing_note" } )

    assert check( [ submitted ], settings )[ 0 ].kind == SuggestionKind.NEW_CONCEPT

def test_drops_a_link_to_the_note_itself( settings: Settings ) -> None:
    result = check( [ submit( "pricing A developer TOOL" ), submit( "Free Tier" ) ], settings )

    assert [ suggestion.target for suggestion in result ] == [ "Free Tier" ]

def test_keeps_an_anchor_found_verbatim( settings: Settings ) -> None:
    result = check( [ submit( "Pricing Playbook", anchor = "Usage-based pricing" ) ], settings )

    assert result[ 0 ].anchor == "Usage-based pricing"

def test_turns_an_anchor_that_is_not_found_into_none( settings: Settings ) -> None:
    result = check( [ submit( "Pricing Playbook", anchor = "usage-based pricing" ), submit( "Free Tier", anchor = "free tier" ) ], settings )

    assert [ suggestion.anchor for suggestion in result ] == [ None, None ]

def test_turns_a_blank_anchor_into_none( settings: Settings ) -> None:
    assert check( [ submit( "Free Tier", anchor = "  " ) ], settings )[ 0 ].anchor is None

def test_drops_duplicate_targets_after_rewriting_and_keeps_the_first( settings: Settings ) -> None:
    result = check(
        [
            submit( "Customer Discovery", reason = "First" ),
            submit( "customer discovery", reason = "Second" ),
            submit( "Free Tier" ),
            submit( "free  tier" )
        ],
        settings
    )

    assert [ ( suggestion.target, suggestion.reason ) for suggestion in result ] == [
        ( "Customer Discovery", "First" ),
        ( "Free Tier", "Relevant." )
    ]

def test_keeps_only_the_first_max_suggestions_in_order( settings: Settings ) -> None:
    limited = settings.model_copy( update = { "max_suggestions": 2 } )
    result = check( [ submit( "One" ), submit( "Two" ), submit( "Three" ) ], limited )

    assert [ suggestion.target for suggestion in result ] == [ "One", "Two" ]

def test_the_cap_applies_after_the_other_checks( settings: Settings ) -> None:
    limited = settings.model_copy( update = { "max_suggestions": 2 } )
    result = check( [ submit( "One" ), submit( "one" ), submit( "Pricing a developer tool" ), submit( "Two" ), submit( "Three" ) ], limited )

    assert [ suggestion.target for suggestion in result ] == [ "One", "Two" ]

def test_no_submissions_gives_no_suggestions( settings: Settings ) -> None:
    assert check( [], settings ) == []

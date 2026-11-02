from pathlib import Path

from atlas_agent.vault.search import search_vault

def hit_locations( root: Path, query: str ) -> list[ tuple[ str, int ] ]:
    result = search_vault( root, query, 20, 200 )

    return [ ( hit.path, hit.line ) for hit in result.hits ]

def test_finds_a_single_term_case_insensitively( fixture_vault: Path ) -> None:
    assert hit_locations( fixture_vault, "ECONOMICS" ) == [
        ( "Ideas/Pricing Playbook.md", 8 ),
        ( "Index.md", 3 ),
        ( "Reading/Unit Economics.md", 2 )
    ]

def test_every_term_must_be_on_the_same_line( fixture_vault: Path ) -> None:
    assert hit_locations( fixture_vault, "customer discovery" ) == [
        ( "Ideas/Developer Tools.md", 8 ),
        ( "Ideas/Marketplace Idea.md", 3 ),
        ( "Ideas/Pricing Playbook.md", 8 )
    ]
    assert hit_locations( fixture_vault, "discovery psychology" ) == []

def test_terms_match_in_any_order_but_a_quoted_phrase_stays_together( fixture_vault: Path ) -> None:
    assert hit_locations( fixture_vault, "needs marketplace" ) == [ ( "Ideas/Marketplace Idea.md", 3 ) ]
    assert hit_locations( fixture_vault, "\"needs marketplace\"" ) == []
    assert hit_locations( fixture_vault, "\"marketplace needs\"" ) == [ ( "Ideas/Marketplace Idea.md", 3 ) ]

def test_orders_notes_by_matching_lines_then_path_and_lines_ascending( fixture_vault: Path ) -> None:
    assert hit_locations( fixture_vault, "pricing" ) == [
        ( "Ideas/Pricing Playbook.md", 2 ),
        ( "Ideas/Pricing Playbook.md", 3 ),
        ( "Ideas/Pricing Playbook.md", 6 ),
        ( "Ideas/Developer Tools.md", 8 )
    ]

def test_does_not_search_hidden_folders( fixture_vault: Path ) -> None:
    paths = [ path for path, _ in hit_locations( fixture_vault, "trash" ) ]

    assert paths == []

def test_snippet_is_the_whole_line_when_it_is_short( fixture_vault: Path ) -> None:
    result = search_vault( fixture_vault, "needs marketplace", 20, 200 )

    assert result.hits[ 0 ].snippet == "A two-sided marketplace needs [[Customer Discovery]] on both sides."

def test_snippet_is_centred_on_the_first_term_when_the_line_is_long( fixture_vault: Path ) -> None:
    snippet = search_vault( fixture_vault, "needs marketplace", 20, 20 ).hits[ 0 ].snippet

    assert len( snippet ) == 20
    assert "needs" in snippet
    assert abs( snippet.index( "needs" ) + 2 - 10 ) <= 2

def test_caps_the_hits_and_counts_the_omitted_ones( fixture_vault: Path ) -> None:
    result = search_vault( fixture_vault, "pricing", 3, 200 )

    assert len( result.hits ) == 3
    assert result.omitted == 1

def test_a_blank_query_finds_nothing( fixture_vault: Path ) -> None:
    result = search_vault( fixture_vault, "   ", 20, 200 )

    assert result.hits == []
    assert result.omitted == 0

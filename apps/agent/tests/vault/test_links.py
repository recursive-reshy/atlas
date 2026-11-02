from pathlib import Path

from atlas_agent.vault.links import collect_link_targets, list_link_targets, parse_wikilink_targets

def test_parses_plain_aliased_and_heading_links() -> None:
    text = "[[a]] [[b|alias]] [[c#Heading]] [[d#Heading|alias]]"

    assert parse_wikilink_targets( text ) == [ "a", "b", "c", "d" ]

def test_trims_the_target() -> None:
    assert parse_wikilink_targets( "[[  Spaced Out  |x]]" ) == [ "Spaced Out" ]

def test_skips_embeds() -> None:
    assert parse_wikilink_targets( "![[diagram.png]] and [[real]]" ) == [ "real" ]

def test_skips_fenced_code_blocks() -> None:
    text = "[[before]]\n```\n[[inside]]\n```\n~~~python\n[[also inside]]\n~~~\n[[after]]"

    assert parse_wikilink_targets( text ) == [ "before", "after" ]

def test_skips_inline_code() -> None:
    assert parse_wikilink_targets( "`[[code]]` and [[link]]" ) == [ "link" ]

def test_skips_links_with_an_empty_target() -> None:
    assert parse_wikilink_targets( "[[#Heading]] [[|alias]] [[ok]]" ) == [ "ok" ]

def test_groups_case_insensitively_and_keeps_the_most_used_casing( fixture_vault: Path ) -> None:
    targets = { target.target: target for target in collect_link_targets( fixture_vault ) }

    assert "customer discovery" not in targets
    assert targets[ "Customer Discovery" ].uses == 3

def test_a_casing_tie_keeps_the_sorted_first_casing( tmp_path: Path ) -> None:
    ( tmp_path / "One.md" ).write_text( "[[beta]] [[Beta]]" )

    assert [ target.target for target in collect_link_targets( tmp_path ) ] == [ "Beta" ]

def test_marks_whether_a_note_exists_by_title_or_stem( fixture_vault: Path, tmp_path: Path ) -> None:
    targets = { target.target: target for target in collect_link_targets( fixture_vault ) }

    assert targets[ "Customer Discovery" ].has_note is False
    assert targets[ "Missing Note" ].has_note is False
    assert targets[ "Unit Economics" ].has_note is True
    assert targets[ "Pricing Playbook" ].has_note is True

    ( tmp_path / "Real Note.md" ).write_text( "---\ntitle: Display Title\n---\n[[real note]] [[display title]]" )
    by_name = { target.target: target.has_note for target in collect_link_targets( tmp_path ) }

    assert by_name == { "real note": True, "display title": True }

def test_ignores_links_in_code_and_embeds_in_the_fixture_vault( fixture_vault: Path ) -> None:
    names = [ target.target for target in collect_link_targets( fixture_vault ) ]

    assert "Not A Link" not in names
    assert "Also Not" not in names
    assert "diagram.png" not in names

def test_orders_by_uses_then_target( fixture_vault: Path ) -> None:
    targets = collect_link_targets( fixture_vault )

    assert [ ( target.target, target.uses ) for target in targets ] == [
        ( "Customer Discovery", 3 ),
        ( "Unit Economics", 2 ),
        ( "Missing Note", 1 ),
        ( "Pricing Playbook", 1 )
    ]

def test_caps_the_list_and_counts_the_omitted_targets( fixture_vault: Path ) -> None:
    result = list_link_targets( fixture_vault, 2 )

    assert [ target.target for target in result.targets ] == [ "Customer Discovery", "Unit Economics" ]
    assert result.omitted == 2

def test_an_empty_vault_has_no_targets( tmp_path: Path ) -> None:
    result = list_link_targets( tmp_path, 500 )

    assert result.targets == []
    assert result.omitted == 0

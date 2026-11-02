from pathlib import Path

from atlas_agent.vault.notes import ReadNoteOutcome, list_all_notes, list_notes, read_note

def test_lists_every_note_sorted_by_path( fixture_vault: Path ) -> None:
    result = list_notes( fixture_vault, 500 )

    assert [ note.path for note in result.notes ] == [
        "Ideas/Developer Tools.md",
        "Ideas/Marketplace Idea.md",
        "Ideas/Pricing Playbook.md",
        "Ideas/Untitled Draft.md",
        "Index.md",
        "Reading/Quoted Title.md",
        "Reading/Thinking Fast and Slow.md",
        "Reading/Unit Economics.md"
    ]
    assert result.omitted == 0

def test_uses_the_front_matter_title_else_the_file_stem( fixture_vault: Path ) -> None:
    titles = { note.path: note.title for note in list_notes( fixture_vault, 500 ).notes }

    assert titles[ "Ideas/Pricing Playbook.md" ] == "Pricing Playbook"
    assert titles[ "Ideas/Marketplace Idea.md" ] == "Marketplace Idea"
    assert titles[ "Index.md" ] == "Index"

def test_unquotes_a_quoted_title_and_keeps_commas_in_titles( fixture_vault: Path ) -> None:
    titles = { note.path: note.title for note in list_notes( fixture_vault, 500 ).notes }

    assert titles[ "Reading/Quoted Title.md" ] == "Quoted: Title"
    assert titles[ "Reading/Thinking Fast and Slow.md" ] == "Thinking, Fast and Slow"

def test_reads_tags_from_an_inline_list_a_comma_string_and_a_block_list( fixture_vault: Path ) -> None:
    tags = { note.path: note.tags for note in list_notes( fixture_vault, 500 ).notes }

    assert tags[ "Ideas/Pricing Playbook.md" ] == [ "saas", "pricing" ]
    assert tags[ "Ideas/Developer Tools.md" ] == [ "devtools", "saas" ]
    assert tags[ "Reading/Thinking Fast and Slow.md" ] == [ "psychology", "books" ]
    assert tags[ "Index.md" ] == []

def test_malformed_front_matter_gives_the_stem_and_no_tags( fixture_vault: Path ) -> None:
    draft = next( note for note in list_notes( fixture_vault, 500 ).notes if note.path == "Ideas/Untitled Draft.md" )

    assert draft.title == "Untitled Draft"
    assert draft.tags == []

def test_caps_the_list_and_counts_the_omitted_notes( fixture_vault: Path ) -> None:
    result = list_notes( fixture_vault, 3 )

    assert [ note.path for note in result.notes ] == [
        "Ideas/Developer Tools.md",
        "Ideas/Marketplace Idea.md",
        "Ideas/Pricing Playbook.md"
    ]
    assert result.omitted == 5

def test_list_all_notes_is_not_capped( fixture_vault: Path ) -> None:
    assert len( list_all_notes( fixture_vault ) ) == 8

def test_an_empty_vault_lists_nothing( tmp_path: Path ) -> None:
    result = list_notes( tmp_path, 500 )

    assert result.notes == []
    assert result.omitted == 0

def test_reads_a_whole_note( fixture_vault: Path ) -> None:
    result = read_note( fixture_vault, "Reading/Quoted Title.md", 8000 )

    assert result.outcome == ReadNoteOutcome.OK
    assert result.note is not None
    assert result.note.title == "Quoted: Title"
    assert result.note.content.endswith( "A note whose title needs quotes.\n" )
    assert result.note.truncated is False

def test_truncates_long_content_and_says_so( fixture_vault: Path ) -> None:
    result = read_note( fixture_vault, "Reading/Quoted Title.md", 10 )

    assert result.note is not None
    assert result.note.content == "---\ntitle:"
    assert result.note.truncated is True

def test_content_exactly_at_the_limit_is_not_truncated( fixture_vault: Path ) -> None:
    length = len( ( fixture_vault / "Index.md" ).read_text() )
    result = read_note( fixture_vault, "Index.md", length )

    assert result.note is not None
    assert result.note.truncated is False

def test_reading_an_invalid_path_returns_the_reason( fixture_vault: Path ) -> None:
    result = read_note( fixture_vault, "../Index.md", 8000 )

    assert result.outcome == ReadNoteOutcome.FAILED
    assert result.note is None
    assert result.reason == "Path '../Index.md' is outside the vault"

def test_reading_a_missing_note_returns_the_reason( fixture_vault: Path ) -> None:
    result = read_note( fixture_vault, "Ideas/Nope.md", 8000 )

    assert result.outcome == ReadNoteOutcome.FAILED
    assert result.reason == "No note at 'Ideas/Nope.md'"

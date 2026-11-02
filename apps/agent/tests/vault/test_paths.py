from pathlib import Path

import pytest

from atlas_agent.config import Settings
from atlas_agent.vault.paths import (
    NotePathOutcome,
    UnknownVaultError,
    iter_note_paths,
    resolve_note,
    vault_for
)

def test_resolves_a_note_inside_the_vault( fixture_vault: Path ) -> None:
    resolved = resolve_note( fixture_vault, "Ideas/Pricing Playbook.md" )

    assert resolved.outcome == NotePathOutcome.OK
    assert resolved.reason is None
    assert resolved.path == ( fixture_vault / "Ideas" / "Pricing Playbook.md" ).resolve()

def test_rejects_a_path_that_climbs_out_of_the_vault( fixture_vault: Path ) -> None:
    resolved = resolve_note( fixture_vault, "../Index.md" )

    assert resolved.outcome == NotePathOutcome.OUTSIDE_VAULT
    assert resolved.path is None
    assert resolved.reason == "Path '../Index.md' is outside the vault"

def test_rejects_an_absolute_path( fixture_vault: Path ) -> None:
    resolved = resolve_note( fixture_vault, "/etc/passwd" )

    assert resolved.outcome == NotePathOutcome.OUTSIDE_VAULT

def test_rejects_a_symlinked_file_that_points_outside( vault_copy: Path, tmp_path: Path ) -> None:
    secret = tmp_path / "secret.md"
    secret.write_text( "secret" )
    ( vault_copy / "Link.md" ).symlink_to( secret )

    resolved = resolve_note( vault_copy, "Link.md" )

    assert resolved.outcome == NotePathOutcome.OUTSIDE_VAULT

def test_rejects_a_file_reached_through_a_symlinked_folder( vault_copy: Path, tmp_path: Path ) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    ( outside / "Note.md" ).write_text( "secret" )
    ( vault_copy / "Escape" ).symlink_to( outside, target_is_directory = True )

    resolved = resolve_note( vault_copy, "Escape/Note.md" )

    assert resolved.outcome == NotePathOutcome.OUTSIDE_VAULT

def test_allows_a_symlink_that_stays_inside_the_vault( vault_copy: Path ) -> None:
    ( vault_copy / "Alias.md" ).symlink_to( vault_copy / "Index.md" )

    assert resolve_note( vault_copy, "Alias.md" ).outcome == NotePathOutcome.OK

def test_rejects_a_file_that_is_not_markdown( fixture_vault: Path ) -> None:
    resolved = resolve_note( fixture_vault, "Reading/attachment.txt" )

    assert resolved.outcome == NotePathOutcome.NOT_MARKDOWN
    assert resolved.reason == "'Reading/attachment.txt' is not a Markdown note"

def test_rejects_dot_folders_and_dot_files( vault_copy: Path ) -> None:
    ( vault_copy / ".hidden.md" ).write_text( "hidden" )

    assert resolve_note( vault_copy, ".trash/Deleted Note.md" ).outcome == NotePathOutcome.HIDDEN
    assert resolve_note( vault_copy, ".obsidian/app.md" ).outcome == NotePathOutcome.HIDDEN
    assert resolve_note( vault_copy, ".hidden.md" ).outcome == NotePathOutcome.HIDDEN

def test_reports_a_missing_note( fixture_vault: Path ) -> None:
    resolved = resolve_note( fixture_vault, "Ideas/Nope.md" )

    assert resolved.outcome == NotePathOutcome.NOT_FOUND
    assert resolved.reason == "No note at 'Ideas/Nope.md'"

def test_a_folder_is_not_a_note( fixture_vault: Path ) -> None:
    assert resolve_note( fixture_vault, "Ideas.md" ).outcome == NotePathOutcome.NOT_FOUND

def test_lists_markdown_notes_sorted_and_skips_hidden_and_other_files( fixture_vault: Path ) -> None:
    paths = [ path.relative_to( fixture_vault.resolve() ).as_posix() for path in iter_note_paths( fixture_vault ) ]

    assert paths == [
        "Ideas/Developer Tools.md",
        "Ideas/Marketplace Idea.md",
        "Ideas/Pricing Playbook.md",
        "Ideas/Untitled Draft.md",
        "Index.md",
        "Reading/Quoted Title.md",
        "Reading/Thinking Fast and Slow.md",
        "Reading/Unit Economics.md"
    ]

def test_listing_leaves_out_symlinks_that_leave_the_vault( vault_copy: Path, tmp_path: Path ) -> None:
    outside = tmp_path / "outside"
    outside.mkdir()
    ( outside / "Note.md" ).write_text( "secret" )
    ( vault_copy / "Escape" ).symlink_to( outside, target_is_directory = True )
    ( vault_copy / "Link.md" ).symlink_to( outside / "Note.md" )

    names = [ path.name for path in iter_note_paths( vault_copy ) ]

    assert "Note.md" not in names
    assert "Link.md" not in names

def test_vault_for_resolves_a_folder_in_the_vaults_root( settings: Settings, vault_copy: Path, vault_dir: str ) -> None:
    assert vault_for( settings, vault_dir ) == vault_copy.resolve()

def test_vault_for_tells_two_vaults_apart( settings: Settings, vault_copy: Path ) -> None:
    other = vault_copy.parent / "other"
    other.mkdir()

    assert vault_for( settings, "other" ) == other.resolve()
    assert vault_for( settings, "other" ) != vault_for( settings, vault_copy.name )

@pytest.mark.parametrize( "name", [ "missing", "", "..", "../vault", "vault/..", "/etc", "vault/Ideas" ] )
def test_vault_for_refuses_a_name_that_is_not_a_vault_folder( settings: Settings, name: str ) -> None:
    with pytest.raises( UnknownVaultError ):
        vault_for( settings, name )

def test_vault_for_refuses_a_file( settings: Settings ) -> None:
    ( settings.vaults_root / "file" ).write_text( "x" )

    with pytest.raises( UnknownVaultError ):
        vault_for( settings, "file" )

def test_vault_for_refuses_a_symlink_to_a_folder_outside_the_root( settings: Settings, tmp_path_factory: pytest.TempPathFactory ) -> None:
    outside = tmp_path_factory.mktemp( "outside" )
    ( settings.vaults_root / "escape" ).symlink_to( outside, target_is_directory = True )

    with pytest.raises( UnknownVaultError ):
        vault_for( settings, "escape" )

def test_vault_for_refuses_a_symlink_to_another_vault_inside_the_root( settings: Settings, vault_copy: Path ) -> None:
    ( settings.vaults_root / "alias" ).symlink_to( vault_copy, target_is_directory = True )

    with pytest.raises( UnknownVaultError ):
        vault_for( settings, "alias" )

import os
from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel

from atlas_agent.config import Settings

class NotePathOutcome( StrEnum ):
    OK = "ok"
    OUTSIDE_VAULT = "outside_vault"
    NOT_MARKDOWN = "not_markdown"
    HIDDEN = "hidden"
    NOT_FOUND = "not_found"

class ResolvedNote( BaseModel ):
    outcome: NotePathOutcome
    reason: str | None = None
    path: Path | None = None

class UnknownVaultError( Exception ):
    pass

def vault_for( settings: Settings, vault_dir: str ) -> Path:
    root = settings.vaults_root.resolve()
    candidate = root / vault_dir

    try:
        vault = candidate.resolve( strict = True )
    except OSError as error:
        raise UnknownVaultError( f"No vault folder '{vault_dir}'" ) from error

    if candidate.is_symlink() or vault.parent != root or not vault.is_dir():
        raise UnknownVaultError( f"'{vault_dir}' is not a vault folder" )

    return vault

def resolve_note( root: Path, relative: str ) -> ResolvedNote:
    vault_root = root.resolve()
    candidate = ( vault_root / relative ).resolve()

    if not candidate.is_relative_to( vault_root ):
        return ResolvedNote(
            outcome = NotePathOutcome.OUTSIDE_VAULT,
            reason = f"Path '{relative}' is outside the vault"
        )

    if any( part.startswith( "." ) for part in Path( relative ).parts ):
        return ResolvedNote(
            outcome = NotePathOutcome.HIDDEN,
            reason = f"'{relative}' is in a hidden folder or is a hidden file"
        )

    if candidate.suffix != ".md":
        return ResolvedNote(
            outcome = NotePathOutcome.NOT_MARKDOWN,
            reason = f"'{relative}' is not a Markdown note"
        )

    if not candidate.is_file():
        return ResolvedNote( outcome = NotePathOutcome.NOT_FOUND, reason = f"No note at '{relative}'" )

    return ResolvedNote( outcome = NotePathOutcome.OK, path = candidate )

def iter_note_paths( root: Path ) -> list[ Path ]:
    vault_root = root.resolve()
    note_paths: list[ Path ] = []

    for directory, folder_names, file_names in os.walk( vault_root ):
        folder_names[ : ] = [ name for name in folder_names if not name.startswith( "." ) ]

        for file_name in file_names:
            note_path = Path( directory ) / file_name

            if file_name.startswith( "." ) or note_path.suffix != ".md":
                continue

            if not note_path.resolve().is_relative_to( vault_root ):
                continue

            note_paths.append( note_path )

    return sorted( note_paths, key = lambda note_path: note_path.relative_to( vault_root ).as_posix() )

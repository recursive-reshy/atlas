from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel

from atlas_agent.vault.paths import NotePathOutcome, iter_note_paths, resolve_note

class NoteSummary( BaseModel ):
    path: str
    title: str
    tags: list[ str ]

class NoteList( BaseModel ):
    notes: list[ NoteSummary ]
    omitted: int

class NoteContent( BaseModel ):
    path: str
    title: str
    content: str
    truncated: bool

class ReadNoteOutcome( StrEnum ):
    OK = "ok"
    FAILED = "failed"

class ReadNoteResult( BaseModel ):
    outcome: ReadNoteOutcome
    reason: str | None = None
    note: NoteContent | None = None

class FrontMatter( BaseModel ):
    title: str | None = None
    tags: list[ str ] = []

def unquote( value: str ) -> str:
    value = value.strip()

    if len( value ) >= 2 and value[ 0 ] == value[ -1 ] and value[ 0 ] in "\"'":
        return value[ 1 : -1 ]

    return value

def split_tags( value: str ) -> list[ str ]:
    value = value.strip()

    if value.startswith( "[" ) and value.endswith( "]" ):
        value = value[ 1 : -1 ]

    return [ tag for tag in ( unquote( part ) for part in value.split( "," ) ) if tag ]

def parse_front_matter( text: str ) -> FrontMatter:
    lines = text.splitlines()

    if not lines or lines[ 0 ].strip() != "---":
        return FrontMatter()

    closing = next( ( index for index, line in enumerate( lines[ 1 : ], start = 1 ) if line.strip() == "---" ), None )

    if closing is None:
        return FrontMatter()

    title: str | None = None
    tags: list[ str ] = []
    is_in_tag_list = False

    for line in lines[ 1 : closing ]:
        if is_in_tag_list and line.strip().startswith( "- " ):
            tag = unquote( line.strip()[ 2 : ] )

            if tag:
                tags.append( tag )

            continue

        is_in_tag_list = False
        key, separator, value = line.partition( ":" )

        if not separator:
            continue

        if key.strip() == "title" and unquote( value ):
            title = unquote( value )

        if key.strip() == "tags":
            tags = split_tags( value )
            is_in_tag_list = not value.strip()

    return FrontMatter( title = title, tags = tags )

def summarize_note( root: Path, note_path: Path ) -> NoteSummary:
    front_matter = parse_front_matter( note_path.read_text( encoding = "utf-8", errors = "replace" ) )

    return NoteSummary(
        path = note_path.relative_to( root.resolve() ).as_posix(),
        title = front_matter.title or note_path.stem,
        tags = front_matter.tags
    )

def list_all_notes( root: Path ) -> list[ NoteSummary ]:
    return [ summarize_note( root, note_path ) for note_path in iter_note_paths( root ) ]

def list_notes( root: Path, limit: int ) -> NoteList:
    notes = list_all_notes( root )

    return NoteList( notes = notes[ : limit ], omitted = max( len( notes ) - limit, 0 ) )

def read_note( root: Path, relative: str, max_chars: int ) -> ReadNoteResult:
    resolved = resolve_note( root, relative )

    if resolved.outcome != NotePathOutcome.OK or resolved.path is None:
        return ReadNoteResult( outcome = ReadNoteOutcome.FAILED, reason = resolved.reason )

    text = resolved.path.read_text( encoding = "utf-8", errors = "replace" )
    summary = summarize_note( root, resolved.path )
    note = NoteContent(
        path = summary.path,
        title = summary.title,
        content = text[ : max_chars ],
        truncated = len( text ) > max_chars
    )

    return ReadNoteResult( outcome = ReadNoteOutcome.OK, note = note )

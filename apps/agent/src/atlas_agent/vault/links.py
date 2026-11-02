import re
from collections import Counter
from pathlib import Path

from pydantic import BaseModel

from atlas_agent.vault.notes import list_all_notes
from atlas_agent.vault.paths import iter_note_paths

WIKILINK_PATTERN = re.compile( r"(?<!!)\[\[([^\[\]\n]+)\]\]" )
INLINE_CODE_PATTERN = re.compile( r"`[^`\n]*`" )

class LinkTarget( BaseModel ):
    target: str
    uses: int
    has_note: bool

class LinkTargetList( BaseModel ):
    targets: list[ LinkTarget ]
    omitted: int

def parse_wikilink_targets( text: str ) -> list[ str ]:
    targets: list[ str ] = []
    is_in_fence = False

    for line in text.splitlines():
        if line.strip().startswith( ( "```", "~~~" ) ):
            is_in_fence = not is_in_fence
            continue

        if is_in_fence:
            continue

        for inner in WIKILINK_PATTERN.findall( INLINE_CODE_PATTERN.sub( "", line ) ):
            target = re.split( r"[#|]", inner, maxsplit = 1 )[ 0 ].strip()

            if target:
                targets.append( target )

    return targets

def collect_link_targets( root: Path ) -> list[ LinkTarget ]:
    casings_by_name: dict[ str, Counter[ str ] ] = {}

    for note_path in iter_note_paths( root ):
        text = note_path.read_text( encoding = "utf-8", errors = "replace" )

        for target in parse_wikilink_targets( text ):
            casings_by_name.setdefault( target.casefold(), Counter() )[ target ] += 1

    note_names: set[ str ] = set()

    for note in list_all_notes( root ):
        note_names.add( note.title.casefold() )
        note_names.add( Path( note.path ).stem.casefold() )

    link_targets = [
        LinkTarget(
            target = min( casings.items(), key = lambda casing: ( -casing[ 1 ], casing[ 0 ] ) )[ 0 ],
            uses = casings.total(),
            has_note = name in note_names
        )
        for name, casings in casings_by_name.items()
    ]

    return sorted( link_targets, key = lambda link_target: ( -link_target.uses, link_target.target.casefold(), link_target.target ) )

def list_link_targets( root: Path, limit: int ) -> LinkTargetList:
    link_targets = collect_link_targets( root )

    return LinkTargetList( targets = link_targets[ : limit ], omitted = max( len( link_targets ) - limit, 0 ) )

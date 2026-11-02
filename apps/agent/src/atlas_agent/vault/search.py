import re
from pathlib import Path

from pydantic import BaseModel

from atlas_agent.vault.paths import iter_note_paths

class SearchHit( BaseModel ):
    path: str
    line: int
    snippet: str

class SearchResult( BaseModel ):
    hits: list[ SearchHit ]
    omitted: int

def search_vault( root: Path, query: str, hits_limit: int, snippet_chars: int ) -> SearchResult:
    terms = [
        ( phrase or word ).lower()
        for phrase, word in re.findall( r'"([^"]*)"|(\S+)', query )
        if ( phrase or word ).strip()
    ]

    if not terms:
        return SearchResult( hits = [], omitted = 0 )

    vault_root = root.resolve()
    hits_by_note: list[ list[ SearchHit ] ] = []

    for note_path in iter_note_paths( root ):
        note_hits: list[ SearchHit ] = []
        lines = note_path.read_text( encoding = "utf-8", errors = "replace" ).splitlines()

        for line_number, line in enumerate( lines, start = 1 ):
            lowered = line.lower()

            if not all( term in lowered for term in terms ):
                continue

            start = max( lowered.index( terms[ 0 ] ) - snippet_chars // 2, 0 )
            note_hits.append(
                SearchHit(
                    path = note_path.relative_to( vault_root ).as_posix(),
                    line = line_number,
                    snippet = line[ start : start + snippet_chars ]
                )
            )

        if note_hits:
            hits_by_note.append( note_hits )

    hits_by_note.sort( key = lambda note_hits: ( -len( note_hits ), note_hits[ 0 ].path ) )
    hits = [ hit for note_hits in hits_by_note for hit in note_hits ]

    return SearchResult( hits = hits[ : hits_limit ], omitted = max( len( hits ) - hits_limit, 0 ) )

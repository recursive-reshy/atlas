from pathlib import Path

from atlas_agent.config import Settings
from atlas_agent.contract.link import LinkNote, LinkSuggestion, SuggestionKind
from atlas_agent.linker.tools import SubmittedSuggestion
from atlas_agent.vault.links import LinkTarget
from atlas_agent.vault.notes import NoteSummary

def apply_checks(
    submitted: list[ SubmittedSuggestion ],
    note: LinkNote,
    notes: list[ NoteSummary ],
    link_targets: list[ LinkTarget ],
    settings: Settings
) -> list[ LinkSuggestion ]:
    own_title = note.title.casefold()
    seen: set[ str ] = set()
    suggestions: list[ LinkSuggestion ] = []

    for suggestion in submitted:
        target = " ".join( suggestion.target.split() )

        if not target:
            continue

        wanted = target.casefold()
        kind = SuggestionKind.NEW_CONCEPT
        matching_note = next(
            ( vault_note for vault_note in notes if wanted in ( vault_note.title.casefold(), Path( vault_note.path ).stem.casefold() ) ),
            None
        )
        matching_target = next( ( link_target for link_target in link_targets if link_target.target.casefold() == wanted ), None )

        if matching_note is not None:
            target = matching_note.title
            kind = SuggestionKind.EXISTING_NOTE
        elif matching_target is not None:
            target = matching_target.target
            kind = SuggestionKind.EXISTING_CONCEPT

        if target.casefold() == own_title or target.casefold() in seen:
            continue

        seen.add( target.casefold() )
        anchor = suggestion.anchor if suggestion.anchor and suggestion.anchor.strip() and suggestion.anchor in note.body else None
        suggestions.append( LinkSuggestion( target = target, kind = kind, anchor = anchor, reason = suggestion.reason ) )

    return suggestions[ : settings.max_suggestions ]

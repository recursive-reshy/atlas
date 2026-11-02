// React
import type { ReactElement } from 'react'
// Packages
import Autocomplete from '@mui/material/Autocomplete'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
// Shared
import type { GmailLabel } from '@atlas/shared'
// App
import { MAX_LABELS } from '#src/gmailMatch'
import type { MatchDraft } from '#src/gmailMatch'

const OPERATORS_URL = 'https://support.google.com/mail/answer/7190'

interface GmailMatchFieldsProps {
  draft: MatchDraft
  labels: GmailLabel[]
  labelsLoading: boolean
  labelsError: string | null
  onChange: ( draft: MatchDraft ) => void
}

export function GmailMatchFields(
  { draft, labels, labelsLoading, labelsError, onChange }: GmailMatchFieldsProps,
): ReactElement {
  // A label deleted in Gmail is still part of the match, so it stays listed, by its id.
  const known = new Map( labels.map( ( label ) => [ label.id, label ] ) )
  const chosen = draft.labelIds.map( ( id ): GmailLabel => {
    return known.get( id ) ?? { id, name: id, type: 'user' }
  } )
  const options = [ ...labels, ...chosen.filter( ( { id } ) => !known.has( id ) ) ]

  return (
    <Stack spacing={ 2 }>
      <ToggleButtonGroup
        exclusive
        size="small"
        aria-label="Match by"
        value={ draft.kind }
        onChange={ ( _event, kind: MatchDraft[ 'kind' ] | null ) => {
          if( kind !== null ) {
            onChange( { ...draft, kind } )
          }
        } }
      >
        <ToggleButton value="labels">Labels</ToggleButton>
        <ToggleButton value="query">Search</ToggleButton>
      </ToggleButtonGroup>
      { draft.kind === 'labels' ? (
        <Autocomplete
          multiple
          size="small"
          options={ options }
          value={ chosen }
          loading={ labelsLoading }
          disabled={ labelsLoading }
          disableCloseOnSelect
          getOptionLabel={ ( { name } ) => name }
          getOptionKey={ ( { id } ) => id }
          isOptionEqualToValue={ ( first, second ) => first.id === second.id }
          getOptionDisabled={ ( { id } ) => {
            return chosen.length >= MAX_LABELS && !draft.labelIds.includes( id )
          } }
          onChange={ ( _event, value ) => {
            onChange( { ...draft, labelIds: value.map( ( { id } ) => id ) } )
          } }
          renderInput={ ( params ) => (
            <TextField
              { ...params }
              label="Labels"
              error={ labelsError !== null }
              helperText={ labelsError ?? 'An email with any of these labels matches' }
            />
          ) }
        />
      ) : (
        <TextField
          size="small"
          label="Gmail search"
          placeholder="from:donotreply@upwork.com"
          value={ draft.query }
          onChange={ ( event ) => onChange( { ...draft, query: event.target.value } ) }
          helperText={ (
            <>
              Anything Gmail&apos;s search box accepts.{ ' ' }
              <Link href={ OPERATORS_URL } target="_blank" rel="noreferrer">
                Search operators
              </Link>
            </>
          ) }
        />
      ) }
    </Stack>
  )
}

// React
import type { ReactElement } from 'react'
// Packages
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// Shared
import { Backfill } from '@atlas/shared'
import type { PromptProfile } from '@atlas/shared'

const BACKFILL_LABELS: Record< Backfill, string > = {
  none: 'None',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All',
}

interface GmailNewsletterFieldsProps {
  profileId: string
  autoSummarize: boolean
  profiles: PromptProfile[]
  backfill?: Backfill
  onProfileChange: ( profileId: string ) => void
  onAutoSummarizeChange: ( autoSummarize: boolean ) => void
  onBackfillChange?: ( backfill: Backfill ) => void
}

// An empty profile id stands for the default profile. Backfill is offered only when adding.
export function GmailNewsletterFields(
  {
    profileId,
    autoSummarize,
    profiles,
    backfill,
    onProfileChange,
    onAutoSummarizeChange,
    onBackfillChange,
  }: GmailNewsletterFieldsProps,
): ReactElement {
  return (
    <Stack spacing={ 2 }>
      <TextField
        select
        size="small"
        label="Prompt profile"
        value={ profiles.some( ( { id } ) => id === profileId ) ? profileId : '' }
        onChange={ ( event ) => onProfileChange( event.target.value ) }
        slotProps={ { select: { displayEmpty: true }, inputLabel: { shrink: true } } }
      >
        <MenuItem value="">Default profile</MenuItem>
        { profiles.map( ( { id, name } ) => (
          <MenuItem key={ id } value={ id }>{ name }</MenuItem>
        ) ) }
      </TextField>
      <FormControlLabel
        label="Summarize automatically"
        control={ (
          <Checkbox
            checked={ autoSummarize }
            onChange={ ( event ) => onAutoSummarizeChange( event.target.checked ) }
          />
        ) }
      />
      { backfill !== undefined && onBackfillChange !== undefined && (
        <TextField
          select
          size="small"
          label="Backfill"
          value={ backfill }
          onChange={ ( event ) => onBackfillChange( Backfill.parse( event.target.value ) ) }
          helperText="Past emails to bring into the inbox. They are never summarized automatically."
        >
          { Backfill.options.map( ( option ) => (
            <MenuItem key={ option } value={ option }>{ BACKFILL_LABELS[ option ] }</MenuItem>
          ) ) }
        </TextField>
      ) }
    </Stack>
  )
}

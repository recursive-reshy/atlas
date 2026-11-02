// React
import type { ReactElement } from 'react'
// Packages
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// Shared
import type { PromptProfile } from '@atlas/shared'

interface FeedFieldsProps {
  name: string
  profileId: string
  autoSummarize: boolean
  profiles: PromptProfile[]
  onNameChange: ( name: string ) => void
  onProfileChange: ( profileId: string ) => void
  onAutoSummarizeChange: ( autoSummarize: boolean ) => void
}

// An empty profile id stands for the default profile.
export function FeedFields(
  {
    name,
    profileId,
    autoSummarize,
    profiles,
    onNameChange,
    onProfileChange,
    onAutoSummarizeChange,
  }: FeedFieldsProps,
): ReactElement {
  return (
    <Stack spacing={ 2 }>
      <TextField
        size="small"
        label="Name"
        value={ name }
        onChange={ ( event ) => onNameChange( event.target.value ) }
      />
      <TextField
        select
        size="small"
        label="Prompt profile"
        value={ profiles.some( ( { id } ) => id === profileId ) ? profileId : '' }
        onChange={ ( event ) => onProfileChange( event.target.value ) }
        slotProps={ { select: { displayEmpty: true }, inputLabel: { shrink: true } } }
      >
        <MenuItem value="">Default profile</MenuItem>
        { profiles.map( ( { id, name: profileName } ) => (
          <MenuItem key={ id } value={ id }>{ profileName }</MenuItem>
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
    </Stack>
  )
}

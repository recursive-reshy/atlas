// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// Shared
import type { MeleteSubject, MeleteTargetLevel } from '@atlas/shared'
import { MeleteTargetLevel as TargetLevel } from '@atlas/shared'
// App
import { LEVELS } from '#src/features/melete/syllabusLevels'

interface SyllabusSetupProps {
  subject: MeleteSubject
  isBusy: boolean
  onDraft: ( setup: { target_level: MeleteTargetLevel, intent: string | null } ) => void
}

export function SyllabusSetup( { subject, isBusy, onDraft }: SyllabusSetupProps ): ReactElement {
  const [ level, setLevel ] = useState< MeleteTargetLevel | '' >( subject.target_level ?? '' )
  const [ intent, setIntent ] = useState( subject.intent ?? '' )
  const chosen = TargetLevel.safeParse( level )

  return (
    <Stack spacing={ 2 }>
      <Typography color="text.secondary">
        Claude drafts what this subject should cover. You can change it before you approve it.
      </Typography>
      { subject.syllabus_status === 'failed' && subject.syllabus_error !== null && (
        <Alert severity="error">{ `The last draft failed: ${ subject.syllabus_error }` }</Alert>
      ) }
      <FormControl>
        <FormLabel id="syllabus-level">How far do you want to take it?</FormLabel>
        <RadioGroup
          aria-labelledby="syllabus-level"
          value={ level }
          onChange={ ( event ) => setLevel( event.target.value as MeleteTargetLevel ) }
        >
          { LEVELS.map( ( { value, label, hint } ) => (
            <FormControlLabel
              key={ value }
              value={ value }
              control={ <Radio /> }
              label={ (
                <>
                  <Typography component="span">{ label }</Typography>
                  <Typography component="span" variant="body2" color="text.secondary">
                    { ` ${ hint }` }
                  </Typography>
                </>
              ) }
              sx={ { minHeight: 44, alignItems: 'center' } }
            />
          ) ) }
        </RadioGroup>
      </FormControl>
      <TextField
        label="Intent (optional)"
        helperText="What it is for, such as a goal or an exam"
        value={ intent }
        multiline
        slotProps={ { htmlInput: { maxLength: 500 } } }
        onChange={ ( event ) => setIntent( event.target.value ) }
      />
      <Button
        variant="contained"
        sx={ { minHeight: 44, alignSelf: 'flex-start' } }
        disabled={ !chosen.success || isBusy }
        onClick={ () => {
          if( chosen.success ) {
            onDraft( {
              target_level: chosen.data,
              intent: intent.trim() === '' ? null : intent.trim(),
            } )
          }
        } }
      >
        Draft syllabus
      </Button>
    </Stack>
  )
}

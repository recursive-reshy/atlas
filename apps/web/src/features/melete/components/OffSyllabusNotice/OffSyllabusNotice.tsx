// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

interface OffSyllabusNoticeProps {
  // Claude's suggested name for a new concept; without one there is nothing to add
  suggestion: string | null
  sections: { id: string, name: string }[]
  isBusy: boolean
  onDismiss: () => void
  onAdd: ( sectionId: string ) => void
}

// A note that fits no concept of the syllabus (ADR 0089): dismiss the flag, or add the
// suggested concept to a section and map the note to it
export function OffSyllabusNotice(
  { suggestion, sections, isBusy, onDismiss, onAdd }: OffSyllabusNoticeProps,
): ReactElement {
  const [ chosen, setChosen ] = useState( '' )
  const sectionId = chosen === '' ? sections[ 0 ]?.id ?? '' : chosen
  const canAdd = suggestion !== null && sectionId !== ''

  return (
    <Stack spacing={ 1 } sx={ { py: 0.5 } }>
      <Typography variant="body2" color="warning.main">
        { suggestion === null
          ? 'Off-syllabus: this note fits none of the concepts.'
          : `Off-syllabus: this note fits none of the concepts. Suggested: “${ suggestion }”.` }
      </Typography>
      <Stack
        direction="row"
        spacing={ 1 }
        useFlexGap
        sx={ { alignItems: 'center', flexWrap: 'wrap' } }
      >
        { canAdd && (
          <>
            <TextField
              select
              size="small"
              label="Section"
              value={ sectionId }
              onChange={ ( event ) => setChosen( event.target.value ) }
              slotProps={ { select: { native: true } } }
            >
              { sections.map( ( { id, name } ) => (
                <option key={ id } value={ id }>{ name }</option>
              ) ) }
            </TextField>
            <Button
              variant="outlined"
              size="small"
              disabled={ isBusy }
              sx={ { minHeight: 44 } }
              onClick={ () => onAdd( sectionId ) }
            >
              Add concept
            </Button>
          </>
        ) }
        <Button size="small" disabled={ isBusy } sx={ { minHeight: 44 } } onClick={ onDismiss }>
          Dismiss
        </Button>
      </Stack>
    </Stack>
  )
}

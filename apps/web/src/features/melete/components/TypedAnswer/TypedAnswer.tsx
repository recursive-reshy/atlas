// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'

interface TypedAnswerProps {
  value: string
  // Graded or skipped: the answer stays on screen but can't be changed.
  isChecked: boolean
  isChecking: boolean
  onChange: ( value: string ) => void
  onCheck: () => void
}

export function TypedAnswer(
  { value, isChecked, isChecking, onChange, onCheck }: TypedAnswerProps,
): ReactElement {
  // Focusing on load would raise the on-screen keyboard on a phone before the question is read.
  const isWide = useMediaQuery( useTheme().breakpoints.up( 'md' ) )

  return (
    <Stack spacing={ 1 }>
      <TextField
        label="Your answer"
        multiline
        minRows={ 3 }
        value={ value }
        autoFocus={ isWide }
        disabled={ isChecking }
        slotProps={ { input: { readOnly: isChecked } } }
        onChange={ ( event ) => onChange( event.target.value ) }
      />
      { !isChecked && (
        <Button
          variant="contained"
          disabled={ isChecking }
          sx={ { minHeight: 48 } }
          onClick={ onCheck }
        >
          { isChecking ? 'Checking…' : 'Check' }
        </Button>
      ) }
    </Stack>
  )
}

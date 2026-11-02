// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// Shared
import { Guidance } from '@atlas/shared'
// App
import { ConfirmDialog } from '../ConfirmDialog'

const LIMIT = 20_000
const RESET_MESSAGE = 'The shipped prompt is saved as a new version. '
  + 'Your current text stays in the history.'
const FIELD_SX = { '& textarea': { fontFamily: 'monospace', fontSize: '0.8125rem' } } as const
const formatCount = ( count: number ): string => `${ count.toLocaleString( 'en-US' ) } / 20,000`

interface PromptEditorProps {
  value: string
  isDirty: boolean
  isSaving: boolean
  canReset: boolean
  error: string | null
  onChange: ( value: string ) => void
  onSave: () => void
  onDiscard: () => void
  onReset: () => void
}

export function PromptEditor(
  { value, isDirty, isSaving, canReset, error, onChange, onSave, onDiscard, onReset }:
  PromptEditorProps,
): ReactElement {
  const [ isConfirmingReset, setIsConfirmingReset ] = useState( false )
  const isTooLong = value.length > LIMIT
  const canSave = isDirty && !isSaving && Guidance.safeParse( value ).success

  return (
    <Stack spacing={ 1 }>
      <TextField
        label="Guidance"
        value={ value }
        onChange={ ( event ) => onChange( event.target.value ) }
        multiline
        minRows={ 10 }
        maxRows={ 24 }
        error={ isTooLong }
        helperText={ isTooLong ? 'Too long: the limit is 20,000 characters.' : undefined }
        sx={ FIELD_SX }
      />
      <Stack direction="row" spacing={ 2 } sx={ { alignItems: 'center', flexWrap: 'wrap' } }>
        <Typography variant="body2" color={ isTooLong ? 'error' : 'text.secondary' }>
          { formatCount( value.length ) }
        </Typography>
        { isDirty && (
          <Typography variant="body2" sx={ { fontWeight: 'bold' } }>Unsaved changes</Typography>
        ) }
      </Stack>
      { error !== null && <Alert severity="error">{ error }</Alert> }
      <Stack direction="row" spacing={ 1 } sx={ { flexWrap: 'wrap', gap: 1 } }>
        <Button variant="contained" onClick={ onSave } disabled={ !canSave }>Save</Button>
        <Button onClick={ onDiscard } disabled={ !isDirty }>Discard changes</Button>
        { canReset && (
          <Button onClick={ () => setIsConfirmingReset( true ) }>Reset to default</Button>
        ) }
      </Stack>
      <ConfirmDialog
        open={ isConfirmingReset }
        title="Reset to the shipped prompt?"
        message={ RESET_MESSAGE }
        confirmLabel="Reset"
        onConfirm={ () => {
          setIsConfirmingReset( false )
          onReset()
        } }
        onCancel={ () => setIsConfirmingReset( false ) }
      />
    </Stack>
  )
}

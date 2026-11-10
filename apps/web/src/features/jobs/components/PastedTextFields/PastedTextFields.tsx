// React
import type { ReactElement } from 'react'
// Packages
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// Shared
import { ARTICLE_LIMITS } from '@atlas/shared'

const HELPER_SX = { display: 'flex', justifyContent: 'space-between', gap: 2 } as const

interface PastedTextFieldsProps {
  text: string
  title: string
  onTextChange: ( text: string ) => void
  onTitleChange: ( title: string ) => void
  disabled?: boolean
}

const messageFor = ( text: string ): string | null => {
  const length = text.trim().length

  if( length > 0 && length < ARTICLE_LIMITS.minPastedChars ) {
    return `Paste at least ${ ARTICLE_LIMITS.minPastedChars } characters`
  }

  if( length > ARTICLE_LIMITS.maxChars ) {
    return `Paste at most ${ ARTICLE_LIMITS.maxChars.toLocaleString( 'en-US' ) } characters`
  }

  return null
}

export function PastedTextFields(
  { text, title, onTextChange, onTitleChange, disabled = false }: PastedTextFieldsProps,
): ReactElement {
  const message = messageFor( text )

  return (
    <Stack spacing={ 1 } sx={ { width: '100%' } }>
      <TextField
        label="Title"
        value={ title }
        disabled={ disabled }
        fullWidth
        onChange={ ( event ) => onTitleChange( event.target.value ) }
      />
      <TextField
        label="Article text"
        value={ text }
        multiline
        rows={ 10 }
        fullWidth
        disabled={ disabled }
        error={ message !== null }
        onChange={ ( event ) => onTextChange( event.target.value ) }
        helperText={ (
          <Box component="span" sx={ HELPER_SX }>
            <span>{ message }</span>
            <span>
              { `${ text.length.toLocaleString( 'en-US' ) } / ${
                ARTICLE_LIMITS.maxChars.toLocaleString( 'en-US' ) }` }
            </span>
          </Box>
        ) }
      />
    </Stack>
  )
}

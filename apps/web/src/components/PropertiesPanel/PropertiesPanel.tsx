// React
import { Fragment } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// Shared
import { NoteParseError, parseNote, serializeNote } from '@atlas/shared'
import type { ParsedNote } from '@atlas/shared'
// App
import { TagInput } from '../TagInput'

const FIXED_TAG = 'mnemosyne'

const READ_ONLY_SX = {
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  gap: '0.25rem 0.5rem',
  m: 0,
} as const

const VALUE_SX = { m: 0, overflowWrap: 'anywhere' } as const

interface PropertiesPanelProps {
  note: string
  onChange: ( note: string ) => void
}

const tryParse = ( note: string ): ParsedNote | null => {
  try {
    return parseNote( note )
  } catch( error ) {
    if( error instanceof NoteParseError ) {
      return null
    }

    throw error
  }
}

export function PropertiesPanel( { note, onChange }: PropertiesPanelProps ): ReactElement {
  const parsed = tryParse( note )

  if( parsed === null ) {
    return <Alert severity="warning" role="status">front-matter invalid</Alert>
  }

  const { properties } = parsed
  const rows = [
    [ 'Source', properties.source ],
    [ 'Channel', properties.channel ],
    [ 'Duration', properties.duration ],
    [ 'Author', properties.author ],
    [ 'Site', properties.site ],
    [ 'Published', properties.published ],
    [ 'Created', 'on save' ],
  ].filter( ( row ): row is [ string, string ] => row[ 1 ] !== undefined )

  const update = ( changes: Partial< ParsedNote[ 'properties' ] > ): void => {
    onChange( serializeNote( { ...parsed, properties: { ...properties, ...changes } } ) )
  }

  const handleTitle = ( event: ChangeEvent< HTMLInputElement > ): void => {
    update( { title: event.target.value } )
  }

  return (
    <Stack spacing={ 2 } sx={ { width: '100%' } }>
      <TextField label="Title" value={ properties.title } onChange={ handleTitle } />
      <TagInput
        tags={ properties.tags.filter( ( tag ) => tag !== FIXED_TAG ) }
        onChange={ ( tags ) => update( { tags: [ FIXED_TAG, ...tags ] } ) }
      />
      <Box component="dl" sx={ READ_ONLY_SX }>
        { rows.map( ( [ term, value ] ) => (
          <Fragment key={ term }>
            <Typography component="dt" sx={ { fontWeight: 600 } }>{ term }</Typography>
            <Typography component="dd" sx={ VALUE_SX }>{ value }</Typography>
          </Fragment>
        ) ) }
      </Box>
    </Stack>
  )
}

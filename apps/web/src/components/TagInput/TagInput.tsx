// React
import { useState } from 'react'
import type { ChangeEvent, KeyboardEvent, ReactElement } from 'react'
// Packages
import CloseIcon from '@mui/icons-material/Close'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// Shared
import { normalizeTag } from '@atlas/shared'
// App

const FIXED_TAG = 'mnemosyne'

const LIST_SX = { flexWrap: 'wrap', gap: 1, m: 0, p: 0, listStyle: 'none' } as const

// A real button inside a plain chip: MUI's own delete icon is not reachable by assistive tech.
const REMOVE_SX = { ml: 0.5, p: 0.25 } as const

interface TagInputProps {
  tags: string[]
  onChange: ( tags: string[] ) => void
}

export function TagInput( { tags, onChange }: TagInputProps ): ReactElement {
  const [ pending, setPending ] = useState( '' )

  const commit = ( raw: string ): void => {
    const tag = normalizeTag( raw )

    setPending( '' )

    if( tag !== '' && tag !== FIXED_TAG && !tags.includes( tag ) ) {
      onChange( [ ...tags, tag ] )
    }
  }

  const handleChange = ( event: ChangeEvent< HTMLInputElement > ): void => {
    const { value } = event.target

    if( value.endsWith( ',' ) ) {
      commit( value.slice( 0, -1 ) )
    } else {
      setPending( value )
    }
  }

  const handleKeyDown = ( event: KeyboardEvent< HTMLInputElement > ): void => {
    if( event.key === 'Enter' ) {
      event.preventDefault()
      commit( pending )
    }
  }

  return (
    <Stack spacing={ 1 } sx={ { width: '100%' } }>
      <Stack component="ul" direction="row" useFlexGap aria-label="Tags" sx={ LIST_SX }>
        <li><Chip label={ FIXED_TAG } variant="outlined" /></li>
        { tags.map( ( tag ) => (
          <li key={ tag }>
            <Chip
              variant="outlined"
              label={ (
                <>
                  { tag }
                  <IconButton
                    size="small"
                    aria-label={ `Remove tag ${ tag }` }
                    onClick={ () => onChange( tags.filter( ( other ) => other !== tag ) ) }
                    sx={ REMOVE_SX }
                  >
                    <CloseIcon fontSize="inherit" />
                  </IconButton>
                </>
              ) }
            />
          </li>
        ) ) }
      </Stack>
      <TextField
        label="Add tag"
        value={ pending }
        onChange={ handleChange }
        onKeyDown={ handleKeyDown }
        onBlur={ () => commit( pending ) }
      />
    </Stack>
  )
}

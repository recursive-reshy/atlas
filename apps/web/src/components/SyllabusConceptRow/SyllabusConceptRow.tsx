// React
import type { ReactElement } from 'react'
// Packages
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import Close from '@mui/icons-material/Close'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// App
import type { DraftConcept } from '#src/syllabusDraft'

interface SyllabusConceptRowProps {
  concept: DraftConcept
  canMoveUp: boolean
  canMoveDown: boolean
  onChange: ( patch: Partial< Pick< DraftConcept, 'name' | 'description' > > ) => void
  onMove: ( direction: -1 | 1 ) => void
  onRemove: () => void
}

const TAP_SX = { width: 44, height: 44 }

export function SyllabusConceptRow(
  { concept, canMoveUp, canMoveDown, onChange, onMove, onRemove }: SyllabusConceptRowProps,
): ReactElement {
  const name = concept.name.trim() === '' ? 'concept' : concept.name

  return (
    <Stack direction="row" spacing={ 0.5 } sx={ { alignItems: 'flex-start' } }>
      <Stack spacing={ 1 } sx={ { flex: 1, minWidth: 0 } }>
        <TextField
          size="small"
          label="Concept name"
          value={ concept.name }
          slotProps={ { htmlInput: { maxLength: 200 } } }
          onChange={ ( event ) => onChange( { name: event.target.value } ) }
        />
        <TextField
          size="small"
          label="Description"
          value={ concept.description }
          slotProps={ { htmlInput: { maxLength: 400 } } }
          onChange={ ( event ) => onChange( { description: event.target.value } ) }
        />
      </Stack>
      <Stack direction="row">
        <IconButton
          aria-label={ `Move ${ name } up` }
          disabled={ !canMoveUp }
          sx={ TAP_SX }
          onClick={ () => onMove( -1 ) }
        >
          <ArrowUpward />
        </IconButton>
        <IconButton
          aria-label={ `Move ${ name } down` }
          disabled={ !canMoveDown }
          sx={ TAP_SX }
          onClick={ () => onMove( 1 ) }
        >
          <ArrowDownward />
        </IconButton>
        <IconButton aria-label={ `Remove ${ name }` } sx={ TAP_SX } onClick={ onRemove }>
          <Close />
        </IconButton>
      </Stack>
    </Stack>
  )
}

// React
import type { ReactElement } from 'react'
// Packages
import Add from '@mui/icons-material/Add'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import Delete from '@mui/icons-material/Delete'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
// App
import { SyllabusConceptRow } from '#src/components/SyllabusConceptRow'
import type { DraftConcept, DraftSection } from '#src/syllabusDraft'

interface SyllabusSectionCardProps {
  section: DraftSection
  isFirst: boolean
  isLast: boolean
  onRename: ( name: string ) => void
  onMove: ( direction: -1 | 1 ) => void
  onRemove: () => void
  onAddConcept: () => void
  onChangeConcept: (
    conceptKey: string,
    patch: Partial< Pick< DraftConcept, 'name' | 'description' > >,
  ) => void
  onMoveConcept: ( conceptKey: string, direction: -1 | 1 ) => void
  onRemoveConcept: ( conceptKey: string ) => void
}

const TAP_SX = { width: 44, height: 44 }

export function SyllabusSectionCard( {
  section,
  isFirst,
  isLast,
  onRename,
  onMove,
  onRemove,
  onAddConcept,
  onChangeConcept,
  onMoveConcept,
  onRemoveConcept,
}: SyllabusSectionCardProps ): ReactElement {
  const label = section.name.trim() === '' ? 'section' : `section ${ section.name }`

  return (
    <Paper variant="outlined" sx={ { p: 1.5 } }>
      <Stack spacing={ 1.5 }>
        <Stack direction="row" spacing={ 0.5 } sx={ { alignItems: 'center' } }>
          <TextField
            size="small"
            label="Section name"
            value={ section.name }
            sx={ { flex: 1, minWidth: 0 } }
            slotProps={ { htmlInput: { maxLength: 200 } } }
            onChange={ ( event ) => onRename( event.target.value ) }
          />
          <IconButton
            aria-label={ `Move ${ label } up` }
            disabled={ isFirst }
            sx={ TAP_SX }
            onClick={ () => onMove( -1 ) }
          >
            <ArrowUpward />
          </IconButton>
          <IconButton
            aria-label={ `Move ${ label } down` }
            disabled={ isLast }
            sx={ TAP_SX }
            onClick={ () => onMove( 1 ) }
          >
            <ArrowDownward />
          </IconButton>
          <IconButton aria-label={ `Remove ${ label }` } sx={ TAP_SX } onClick={ onRemove }>
            <Delete />
          </IconButton>
        </Stack>
        { section.concepts.map( ( concept, index ) => (
          <SyllabusConceptRow
            key={ concept.key }
            concept={ concept }
            canMoveUp={ !( isFirst && index === 0 ) }
            canMoveDown={ !( isLast && index === section.concepts.length - 1 ) }
            onChange={ ( patch ) => onChangeConcept( concept.key, patch ) }
            onMove={ ( direction ) => onMoveConcept( concept.key, direction ) }
            onRemove={ () => onRemoveConcept( concept.key ) }
          />
        ) ) }
        <Button
          startIcon={ <Add /> }
          sx={ { minHeight: 44, alignSelf: 'flex-start' } }
          onClick={ onAddConcept }
        >
          Add concept
        </Button>
      </Stack>
    </Paper>
  )
}

// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// Shared
import type { MeleteNote, MeleteSyllabus } from '@atlas/shared'

interface NoteConceptsEditorProps {
  note: MeleteNote
  syllabus: MeleteSyllabus
  isSaving: boolean
  error: string | null
  onSave: ( conceptIds: string[] ) => void
}

type Option = { id: string, name: string, section: string }

// The note's concepts by hand (ADR 0089): saving pins the mapping, and Claude then only
// labels the note's questions with the concepts chosen here
export function NoteConceptsEditor(
  { note, syllabus, isSaving, error, onSave }: NoteConceptsEditorProps,
): ReactElement {
  const options: Option[] = syllabus.sections.flatMap( ( { name: section, concepts } ) => {
    return concepts.map( ( { id, name } ) => ( { id, name, section } ) )
  } )
  const mapped = options.filter( ( { id } ) => note.concept_ids.includes( id ) )
  const [ chosen, setChosen ] = useState< Option[] >( mapped )
  const sameAs = ( ids: string[] ): boolean => {
    return ids.length === chosen.length && chosen.every( ( { id } ) => ids.includes( id ) )
  }
  const inOrder = options.filter( ( { id } ) => chosen.some( ( pick ) => pick.id === id ) )

  return (
    <Stack spacing={ 1 }>
      <Typography variant="h6" component="h3">Concepts</Typography>
      <Autocomplete
        multiple
        options={ options }
        value={ chosen }
        groupBy={ ( option ) => option.section }
        getOptionLabel={ ( option ) => option.name }
        isOptionEqualToValue={ ( option, value ) => option.id === value.id }
        onChange={ ( _event, value ) => setChosen( value ) }
        renderInput={ ( params ) => <TextField { ...params } label="Concepts" /> }
      />
      { note.mapping_pinned && (
        <Typography variant="body2" color="text.secondary">
          Set by hand. These concepts stay until the note changes.
        </Typography>
      ) }
      { ( note.mapping === 'queued' || note.mapping === 'mapping' ) && (
        <Typography variant="body2" color="text.secondary">Labelling the questions…</Typography>
      ) }
      { error !== null && <Alert severity="error">{ error }</Alert> }
      <Stack direction="row">
        <Button
          variant="outlined"
          disabled={ isSaving || sameAs( note.concept_ids ) }
          sx={ { minHeight: 44 } }
          onClick={ () => onSave( inOrder.map( ( { id } ) => id ) ) }
        >
          Save mapping
        </Button>
      </Stack>
    </Stack>
  )
}

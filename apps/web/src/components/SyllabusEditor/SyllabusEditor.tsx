// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type {
  MeleteSyllabus,
  MeleteSyllabusDiff,
  MeleteSyllabusEdit,
} from '@atlas/shared'
import { MELETE_MAX_CONCEPTS } from '@atlas/shared'
// App
import { ConfirmDialog } from '#src/components/ConfirmDialog'
import { SyllabusSectionCard } from '#src/components/SyllabusSectionCard'
import * as draftOf from '#src/syllabusDraft'

interface SyllabusEditorProps {
  syllabus: MeleteSyllabus
  status: 'draft' | 'approved'
  isBusy: boolean
  savedDiff: MeleteSyllabusDiff | null
  onSave: ( edit: MeleteSyllabusEdit ) => void
  onApprove: () => void
  onRedraft: () => void
}

const REDRAFT_MESSAGE = [
  'Claude drafts a new syllabus and replaces this one, with your edits.',
  'You approve it again, and your notes are mapped again.',
].join( ' ' )

const diffText = ( { renamed, added, removed, moved }: MeleteSyllabusDiff ): string => {
  const parts = [
    [ renamed, 'renamed' ],
    [ added, 'added' ],
    [ removed, 'removed' ],
    [ moved, 'moved' ],
  ].filter( ( [ count ] ) => count !== 0 ).map( ( [ count, what ] ) => `${ count } ${ what }` )

  return parts.length === 0 ? 'Saved' : `Saved: ${ parts.join( ', ' ) }`
}

export function SyllabusEditor( {
  syllabus,
  status,
  isBusy,
  savedDiff,
  onSave,
  onApprove,
  onRedraft,
}: SyllabusEditorProps ): ReactElement {
  const [ draft, setDraft ] = useState( () => draftOf.toDraft( syllabus ) )
  const [ isConfirming, setIsConfirming ] = useState( false )
  const isDirty = draftOf.isDirty( draft, syllabus )
  const problem = draftOf.problemWith( draft )
  const change = ( edit: ( current: draftOf.Draft ) => draftOf.Draft ): void => {
    setDraft( edit )
  }

  return (
    <Stack spacing={ 2 }>
      <Typography variant="body2" color="text.secondary">
        { `${ draftOf.conceptCount( draft ) } of ${ MELETE_MAX_CONCEPTS } concepts` }
        { status === 'approved' && ' · ' }
        { status === 'approved' && <strong>Approved</strong> }
      </Typography>
      { savedDiff !== null && !isDirty && (
        <Typography role="status" variant="body2">{ diffText( savedDiff ) }</Typography>
      ) }
      { draft.map( ( section, index ) => (
        <SyllabusSectionCard
          key={ section.key }
          section={ section }
          isFirst={ index === 0 }
          isLast={ index === draft.length - 1 }
          onRename={ ( name ) => change( ( d ) => draftOf.setSectionName( d, section.key, name ) ) }
          onMove={ ( dir ) => change( ( d ) => draftOf.moveSection( d, section.key, dir ) ) }
          onRemove={ () => change( ( d ) => draftOf.removeSection( d, section.key ) ) }
          onAddConcept={ () => {
            change( ( d ) => draftOf.addConcept( d, section.key, crypto.randomUUID() ) )
          } }
          onChangeConcept={ ( key, patch ) => {
            change( ( d ) => draftOf.setConcept( d, section.key, key, patch ) )
          } }
          onMoveConcept={ ( key, dir ) => {
            change( ( d ) => draftOf.moveConcept( d, section.key, key, dir ) )
          } }
          onRemoveConcept={ ( key ) => {
            change( ( d ) => draftOf.removeConcept( d, section.key, key ) )
          } }
        />
      ) ) }
      <Button
        sx={ { minHeight: 44, alignSelf: 'flex-start' } }
        onClick={ () => {
          change( ( d ) => draftOf.addSection( d, crypto.randomUUID(), crypto.randomUUID() ) )
        } }
      >
        Add section
      </Button>
      { problem !== null && <Alert severity="warning">{ problem }</Alert> }
      { isDirty && status === 'draft' && (
        <Typography variant="body2" color="text.secondary">
          Save your changes before approving
        </Typography>
      ) }
      <Stack direction="row" spacing={ 1 } useFlexGap sx={ { flexWrap: 'wrap' } }>
        <Button
          variant="contained"
          sx={ { minHeight: 44 } }
          disabled={ !isDirty || problem !== null || isBusy }
          onClick={ () => onSave( draftOf.toEdit( draft ) ) }
        >
          Save changes
        </Button>
        { isDirty && (
          <Button
            sx={ { minHeight: 44 } }
            onClick={ () => setDraft( draftOf.toDraft( syllabus ) ) }
          >
            Discard changes
          </Button>
        ) }
        { status === 'draft' && (
          <Button
            variant="outlined"
            sx={ { minHeight: 44 } }
            disabled={ isDirty || problem !== null || isBusy }
            onClick={ onApprove }
          >
            Approve
          </Button>
        ) }
        <Button
          sx={ { minHeight: 44 } }
          disabled={ isBusy }
          onClick={ () => setIsConfirming( true ) }
        >
          Redraft
        </Button>
      </Stack>
      <ConfirmDialog
        open={ isConfirming }
        title="Redraft the syllabus?"
        message={ REDRAFT_MESSAGE }
        confirmLabel="Redraft"
        onCancel={ () => setIsConfirming( false ) }
        onConfirm={ () => {
          setIsConfirming( false )
          onRedraft()
        } }
      />
    </Stack>
  )
}

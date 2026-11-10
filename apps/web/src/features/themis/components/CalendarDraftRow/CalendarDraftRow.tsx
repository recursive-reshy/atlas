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
import type { CalendarDraft } from '@atlas/shared'
// App
import {
  useApproveDraft,
  useDismissDraft,
  useUpdateDraft,
} from '#src/features/themis/hooks/useCalendarDraftMutations'
import type { TimeTarget } from '#src/features/themis/hooks/useTimeTargets'
import { formatStudyTime } from '#src/lib/formatStudyTime'
import { TargetSelect } from '../TargetSelect'

interface CalendarDraftRowProps {
  draft: CalendarDraft
  subjects: TimeTarget[]
  goals: TimeTarget[]
  onMakeRule: ( title: string ) => void
  onRecorded: ( seconds: number ) => void
}

const BUTTON_SX = { minHeight: 44, minWidth: 44 }
const pad = ( value: number ): string => String( value ).padStart( 2, '0' )

const clock = ( iso: string ): string => {
  const at = new Date( iso )

  return `${ pad( at.getHours() ) }:${ pad( at.getMinutes() ) }`
}

const targetOf = ( { subject_id: subject, goal_id: goal }: CalendarDraft ): string => {
  if( subject !== null ) {
    return `subject:${ subject }`
  }

  return goal === null ? '' : `goal:${ goal }`
}

const countsLine = ( draft: CalendarDraft ): string => [
  formatStudyTime( draft.seconds ),
  ...( draft.overlap_seconds > 0
    ? [ `${ formatStudyTime( draft.overlap_seconds ) } already measured` ]
    : [] ),
  `counts ${ formatStudyTime( draft.counts_seconds ) }`,
].join( ' · ' )

// One event to review: who it counts toward, what it adds, then approve or dismiss (ADR 0108)
export function CalendarDraftRow(
  { draft, subjects, goals, onMakeRule, onRecorded }: CalendarDraftRowProps,
): ReactElement {
  const update = useUpdateDraft()
  const approve = useApproveDraft()
  const dismiss = useDismissDraft()
  const [ note, setNote ] = useState( draft.note ?? '' )
  const failure = [ update, approve, dismiss ].find( ( { isError } ) => isError )?.error

  const handleAssign = ( value: string ): void => {
    const [ kind, id ] = value.split( ':' )

    if( value !== '' ) {
      const body = kind === 'subject' ? { subject_id: id } : { goal_id: id }

      update.mutate( { id: draft.id, body } )
    }
  }

  const handleNoteBlur = (): void => {
    const trimmed = note.trim()

    if( trimmed !== ( draft.note ?? '' ) ) {
      update.mutate( { id: draft.id, body: { note: trimmed === '' ? null : trimmed } } )
    }
  }

  // The row is gone once the lists refresh, so the result is read from the promise
  const handleApprove = (): void => {
    approve.mutateAsync( draft.id ).then(
      ( { recorded_seconds: seconds } ) => onRecorded( seconds ),
      () => undefined,
    )
  }

  return (
    <Stack
      component="li"
      spacing={ 1.5 }
      sx={ { listStyle: 'none', p: 2, border: 1, borderColor: 'divider', borderRadius: 1 } }
    >
      <Stack direction="row" sx={ { justifyContent: 'space-between', gap: 1 } }>
        <Typography variant="caption" color="text.secondary">{ draft.day }</Typography>
        <Typography variant="caption" color="text.secondary">
          { `${ clock( draft.started_at ) }–${ clock( draft.ended_at ) }` }
        </Typography>
      </Stack>
      <Typography sx={ { overflowWrap: 'anywhere' } }>{ draft.title }</Typography>
      <Typography variant="body2" color="text.secondary">{ countsLine( draft ) }</Typography>
      <TargetSelect
        label="Counts toward"
        value={ targetOf( draft ) }
        subjects={ subjects }
        goals={ goals }
        onChange={ handleAssign }
      />
      { draft.assigned_by === 'rule' && draft.rule_phrase !== null && (
        <Typography variant="caption" color="text.secondary">
          { `Assigned by the rule "${ draft.rule_phrase }"` }
        </Typography>
      ) }
      <TextField
        label="Note (optional)"
        value={ note }
        onChange={ ( event ) => setNote( event.target.value ) }
        onBlur={ handleNoteBlur }
        slotProps={ { htmlInput: { maxLength: 500 } } }
      />
      { failure !== undefined && failure !== null && (
        <Alert severity="error">{ failure.message }</Alert>
      ) }
      <Stack direction="row" sx={ { flexWrap: 'wrap', gap: 1 } }>
        <Button
          variant="contained"
          disabled={ targetOf( draft ) === '' || approve.isPending }
          onClick={ handleApprove }
          sx={ BUTTON_SX }
        >
          Approve
        </Button>
        <Button
          variant="outlined"
          disabled={ dismiss.isPending }
          onClick={ () => dismiss.mutate( draft.id ) }
          sx={ BUTTON_SX }
        >
          Dismiss
        </Button>
        <Button onClick={ () => onMakeRule( draft.title ) } sx={ BUTTON_SX }>Make a rule</Button>
      </Stack>
    </Stack>
  )
}

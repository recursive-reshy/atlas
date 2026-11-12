// React
import type { ReactElement } from 'react'
// Packages
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import DownIcon from '@mui/icons-material/ArrowDownward'
import UpIcon from '@mui/icons-material/ArrowUpward'
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { CalendarRule } from '@atlas/shared'
// App
import {
  useDeleteRule,
  useUpdateRule,
} from '#src/features/themis/hooks/useCalendarRuleMutations'
import type { TimeTarget } from '#src/features/themis/hooks/useTimeTargets'
import { TargetSelect } from '../TargetSelect'

interface CalendarRuleRowProps {
  rule: CalendarRule
  isFirst: boolean
  isLast: boolean
  subjects: TimeTarget[]
  goals: TimeTarget[]
}

const ICON_SX = { minHeight: 44, minWidth: 44 }

const targetOf = ( { subject_id: subject, goal_id: goal }: CalendarRule ): string => {
  if( subject !== null ) {
    return `subject:${ subject }`
  }

  return goal === null ? '' : `goal:${ goal }`
}

// One title rule: its phrase, who it assigns to, where it sits in the order, and delete
export function CalendarRuleRow(
  { rule, isFirst, isLast, subjects, goals }: CalendarRuleRowProps,
): ReactElement {
  const update = useUpdateRule()
  const remove = useDeleteRule()
  const failure = [ update, remove ].find( ( { isError } ) => isError )?.error

  const handleTarget = ( value: string ): void => {
    const [ kind, id ] = value.split( ':' )

    if( value !== '' ) {
      const body = kind === 'subject' ? { subject_id: id } : { goal_id: id }

      update.mutate( { id: rule.id, body } )
    }
  }

  const move = ( by: number ): void => {
    update.mutate( { id: rule.id, body: { position: rule.position + by } } )
  }

  return (
    <Stack
      component="li"
      spacing={ 1 }
      sx={ { listStyle: 'none', p: 2, border: 1, borderColor: 'divider', borderRadius: 1 } }
    >
      <Typography sx={ { overflowWrap: 'anywhere' } }>{ rule.phrase }</Typography>
      <TargetSelect
        label="Assigns to"
        value={ targetOf( rule ) }
        subjects={ subjects }
        goals={ goals }
        onChange={ handleTarget }
      />
      { failure !== undefined && failure !== null && (
        <Alert severity="error">{ failure.message }</Alert>
      ) }
      <Stack direction="row">
        <IconButton
          aria-label="Move up"
          disabled={ isFirst }
          onClick={ () => move( -1 ) }
          sx={ ICON_SX }
        >
          <UpIcon />
        </IconButton>
        <IconButton
          aria-label="Move down"
          disabled={ isLast }
          onClick={ () => move( 1 ) }
          sx={ ICON_SX }
        >
          <DownIcon />
        </IconButton>
        <IconButton
          aria-label="Delete rule"
          onClick={ () => remove.mutate( rule.id ) }
          sx={ ICON_SX }
        >
          <DeleteIcon />
        </IconButton>
      </Stack>
    </Stack>
  )
}

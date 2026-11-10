// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// App
import { useCalendarRules } from '#src/features/themis/hooks/useCalendarRules'
import { useCreateRule } from '#src/features/themis/hooks/useCalendarRuleMutations'
import { useTimeTargets } from '#src/features/themis/hooks/useTimeTargets'
import { CalendarRuleRow } from '../CalendarRuleRow'
import { TargetSelect } from '../TargetSelect'

interface CalendarRulesProps {
  // Fills the add row, for "Make a rule" on a draft
  initialPhrase?: string
}

const MAX_PHRASE = 100

// Title rules in order: the first whose phrase is in an event's title assigns it (ADR 0108)
export function CalendarRules( { initialPhrase = '' }: CalendarRulesProps ): ReactElement {
  const { rules, isLoading, error } = useCalendarRules()
  const { subjects, goals } = useTimeTargets()
  const create = useCreateRule()
  const [ phrase, setPhrase ] = useState( initialPhrase )
  const [ target, setTarget ] = useState( '' )
  const ordered = [ ...rules ].sort( ( a, b ) => a.position - b.position )
  const trimmed = phrase.trim()

  const handleAdd = (): void => {
    const [ kind, id ] = target.split( ':' )

    create.mutate(
      kind === 'subject' ? { phrase: trimmed, subject_id: id } : { phrase: trimmed, goal_id: id },
      {
        onSuccess: () => {
          setPhrase( '' )
          setTarget( '' )
        },
      },
    )
  }

  return (
    <Stack spacing={ 2 }>
      { isLoading && <Typography role="status">Loading rules…</Typography> }
      { error !== null && <Alert severity="error">{ error }</Alert> }
      { !isLoading && error === null && ordered.length === 0 && (
        <Typography color="text.secondary">
          No rules yet. A rule assigns calendar events whose title contains a phrase to a subject
          or a goal; the first rule that matches wins.
        </Typography>
      ) }
      <Stack component="ul" spacing={ 2 } sx={ { m: 0, p: 0 } }>
        { ordered.map( ( rule, index ) => (
          <CalendarRuleRow
            key={ rule.id }
            rule={ rule }
            isFirst={ index === 0 }
            isLast={ index === ordered.length - 1 }
            subjects={ subjects }
            goals={ goals }
          />
        ) ) }
      </Stack>
      <Stack spacing={ 1.5 } sx={ { maxWidth: '24rem' } }>
        <Typography component="h2" variant="h6">Add a rule</Typography>
        { create.isError && <Alert severity="error">{ create.error.message }</Alert> }
        <TextField
          label="Phrase"
          value={ phrase }
          onChange={ ( event ) => setPhrase( event.target.value ) }
          helperText="Matches a title containing this text, ignoring case"
          slotProps={ { htmlInput: { maxLength: MAX_PHRASE } } }
        />
        <TargetSelect
          label="New rule assigns to"
          value={ target }
          subjects={ subjects }
          goals={ goals }
          onChange={ setTarget }
        />
        <Button
          variant="contained"
          disabled={ trimmed === '' || target === '' || create.isPending }
          onClick={ handleAdd }
          sx={ { minHeight: 44, alignSelf: 'flex-start' } }
        >
          Add rule
        </Button>
      </Stack>
    </Stack>
  )
}

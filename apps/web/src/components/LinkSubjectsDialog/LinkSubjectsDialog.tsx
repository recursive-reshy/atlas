// React
import { useId, useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import Typography from '@mui/material/Typography'
// Shared
import type { MeleteSubject } from '@atlas/shared'
// App
import { useSetGoalSubjects } from '#src/hooks/useGoalMutations'
import { useMeleteToday } from '#src/features/melete/hooks/useMeleteToday'

interface LinkSubjectsDialogProps {
  goalId: string
  onClose: () => void
}

const label = ( subject: MeleteSubject, goalId: string ): ReactElement => (
  <>
    { subject.name }
    { subject.goal_id !== null && subject.goal_id !== goalId && (
      <Typography variant="caption" color="text.secondary" sx={ { display: 'block' } }>
        Linked to another goal; ticking it moves it here
      </Typography>
    ) }
  </>
)

// Sets exactly the ticked subjects for the goal; a subject belongs to at most one goal
export function LinkSubjectsDialog( { goalId, onClose }: LinkSubjectsDialogProps ): ReactElement {
  const titleId = useId()
  const { today, isLoading, error } = useMeleteToday()
  const [ chosen, setChosen ] = useState< Set< string > | null >( null )
  const setSubjects = useSetGoalSubjects()
  const subjects = today?.subjects ?? []
  const linkedHere = subjects.filter( ( { goal_id: linked } ) => linked === goalId )
  const selected = chosen ?? new Set( linkedHere.map( ( { id } ) => id ) )

  const toggle = ( id: string ): void => {
    const next = new Set( selected )

    if( !next.delete( id ) ) {
      next.add( id )
    }

    setChosen( next )
  }

  const handleSave = (): void => {
    const subjectIds = subjects.filter( ( { id } ) => selected.has( id ) ).map( ( { id } ) => id )

    setSubjects.mutate( { goalId, subjectIds }, { onSuccess: onClose } )
  }

  return (
    <Dialog open fullWidth maxWidth="xs" onClose={ onClose } aria-labelledby={ titleId }>
      <DialogTitle id={ titleId }>Link subjects</DialogTitle>
      <DialogContent>
        { isLoading && <Typography role="status">Loading subjects…</Typography> }
        { !isLoading && today === null && (
          <Alert severity="error">{ error ?? 'Could not load subjects' }</Alert>
        ) }
        { today !== null && subjects.length === 0 && (
          <Typography color="text.secondary">No subjects yet. Add one in Melete.</Typography>
        ) }
        <FormGroup>
          { subjects.map( ( subject ) => (
            <FormControlLabel
              key={ subject.id }
              label={ label( subject, goalId ) }
              control={ (
                <Checkbox
                  checked={ selected.has( subject.id ) }
                  onChange={ () => toggle( subject.id ) }
                />
              ) }
              sx={ { minHeight: 44 } }
            />
          ) ) }
        </FormGroup>
        { setSubjects.error && <Alert severity="error">{ setSubjects.error.message }</Alert> }
      </DialogContent>
      <DialogActions>
        <Button onClick={ onClose } sx={ { minHeight: 44 } }>Cancel</Button>
        <Button
          variant="contained"
          disabled={ today === null || setSubjects.isPending }
          onClick={ handleSave }
          sx={ { minHeight: 44 } }
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

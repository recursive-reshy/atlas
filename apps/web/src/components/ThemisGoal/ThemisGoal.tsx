// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useNavigate, useParams } from 'react-router'
// App
import { useDeleteGoal } from '#src/hooks/useGoalMutations'
import { useMe } from '#src/hooks/useMe'
import { useThemisGoal } from '#src/hooks/useThemisGoals'
import { useThemisOverview } from '#src/hooks/useThemisOverview'
import { ConfirmDialog } from '../ConfirmDialog'
import { GoalDialog } from '../GoalDialog'
import { GoalHistory } from '../GoalHistory'
import { GoalTimeByWeek } from '../GoalTimeByWeek'
import { LinkSubjectsDialog } from '../LinkSubjectsDialog'
import { MetricUpdateDialog } from '../MetricUpdateDialog'
import { OutcomeDisplay } from '../OutcomeDisplay'

type Open = 'edit' | 'metric' | 'link' | 'delete' | null

const STATUS_LABELS = { achieved: 'Achieved', dropped: 'Dropped' } as const

// One goal with its outcome, time by week, linked subjects and history (ADR 0092)
export function ThemisGoal(): ReactElement {
  const goalId = useParams().goalId ?? ''
  const navigate = useNavigate()
  const [ open, setOpen ] = useState< Open >( null )
  const { detail, isLoading, error } = useThemisGoal( goalId )
  const { overview } = useThemisOverview( 'week' )
  const hasMelete = useMe().me?.modules.includes( 'melete' ) ?? false
  const remove = useDeleteGoal()

  if( isLoading ) {
    return <Typography role="status">Loading the goal…</Typography>
  }

  if( detail === null ) {
    return <Alert severity="error">{ error ?? 'Could not load the goal' }</Alert>
  }

  const { goal, outcome, subjects } = detail
  const areas = overview?.areas ?? []
  const areaName = areas.find( ( { id } ) => id === goal.area_id )?.name
  const close = (): void => setOpen( null )
  const handleDeleted = (): void => {
    void navigate( '/themis' )
  }

  return (
    <Stack spacing={ 3 } sx={ { maxWidth: '40rem' } }>
      <Link
        component={ RouterLink }
        to="/themis"
        sx={ { minHeight: 44, display: 'inline-flex', alignItems: 'center' } }
      >
        Themis
      </Link>
      <Stack spacing={ 0.5 }>
        <Typography component="h1" variant="h5">{ goal.name }</Typography>
        <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'center', flexWrap: 'wrap' } }>
          { areaName !== undefined && <Typography color="text.secondary">{ areaName }</Typography> }
          { goal.status !== 'active' && (
            <Chip label={ STATUS_LABELS[ goal.status ] } size="small" />
          ) }
          { goal.target_date !== null && (
            <Typography color="text.secondary">{ `Target ${ goal.target_date }` }</Typography>
          ) }
        </Stack>
      </Stack>
      <Stack direction="row" spacing={ 1 } sx={ { flexWrap: 'wrap', gap: 1 } }>
        <Button variant="outlined" onClick={ () => setOpen( 'edit' ) } sx={ { minHeight: 44 } }>
          Edit goal
        </Button>
        { outcome.type === 'metric' && (
          <Button variant="outlined" onClick={ () => setOpen( 'metric' ) } sx={ { minHeight: 44 } }>
            Log update
          </Button>
        ) }
        { hasMelete && (
          <Button variant="outlined" onClick={ () => setOpen( 'link' ) } sx={ { minHeight: 44 } }>
            Link subjects
          </Button>
        ) }
        <Button color="error" onClick={ () => setOpen( 'delete' ) } sx={ { minHeight: 44 } }>
          Delete goal
        </Button>
      </Stack>
      <OutcomeDisplay outcome={ outcome } />
      <GoalTimeByWeek weeks={ detail.time_by_week } />
      { subjects.length > 0 && (
        <Stack component="section" aria-labelledby="linked-subjects" spacing={ 1 }>
          <Typography component="h2" variant="h6" id="linked-subjects">Linked subjects</Typography>
          <Stack direction="row" sx={ { flexWrap: 'wrap', gap: 1 } }>
            { subjects.map( ( { id, name } ) => <Chip key={ id } label={ name } /> ) }
          </Stack>
        </Stack>
      ) }
      <GoalHistory detail={ detail } />
      { open === 'edit' && (
        <GoalDialog goal={ goal } areaId={ null } areas={ areas } onClose={ close } />
      ) }
      { open === 'metric' && outcome.type === 'metric' && (
        <MetricUpdateDialog
          goal={ { id: goal.id, name: goal.name, unit: outcome.unit } }
          onClose={ close }
        />
      ) }
      { open === 'link' && <LinkSubjectsDialog goalId={ goal.id } onClose={ close } /> }
      <ConfirmDialog
        open={ open === 'delete' }
        title="Delete this goal?"
        message={ 'Deleting the goal removes its metric updates, check-ins and the time logged '
          + 'against it. Subjects linked to it are unlinked and keep their own time.' }
        confirmLabel="Delete goal"
        onCancel={ close }
        onConfirm={ () => remove.mutate( goal.id, { onSuccess: handleDeleted } ) }
      />
      { remove.error && <Alert severity="error">{ remove.error.message }</Alert> }
    </Stack>
  )
}

// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { ThemisOverviewArea } from '@atlas/shared'
// App
import { GoalCard } from '../GoalCard'

interface AreaSectionProps {
  area: ThemisOverviewArea
  onEdit: ( area: { id: string, name: string } ) => void
  onAddGoal: ( areaId: string ) => void
}

// One area on the home: its name, its actions and its active goals
export function AreaSection( { area, onEdit, onAddGoal }: AreaSectionProps ): ReactElement {
  const { id, name, goals } = area

  return (
    <Stack component="section" aria-labelledby={ `area-${ id }` } spacing={ 1.5 }>
      <Stack
        direction="row"
        sx={ { justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' } }
      >
        <Typography component="h2" variant="h6" id={ `area-${ id }` }>{ name }</Typography>
        <Stack direction="row" spacing={ 1 }>
          <Button
            size="small"
            aria-label={ `Edit area ${ name }` }
            onClick={ () => onEdit( { id, name } ) }
            sx={ { minHeight: 44 } }
          >
            Edit
          </Button>
          <Button
            size="small"
            aria-label={ `Add goal to ${ name }` }
            onClick={ () => onAddGoal( id ) }
            sx={ { minHeight: 44 } }
          >
            Add goal
          </Button>
        </Stack>
      </Stack>
      { goals.length === 0 && <Typography color="text.secondary">No active goals</Typography> }
      { goals.map( ( card ) => <GoalCard key={ card.goal.id } card={ card } /> ) }
    </Stack>
  )
}

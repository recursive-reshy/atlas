// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import SettingsIcon from '@mui/icons-material/SettingsOutlined'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// App
import { useMeleteToday } from '#src/features/melete/hooks/useMeleteToday'
import { LearningRootSetup } from '../LearningRootSetup'
import { MeleteSkippedNotice } from '../MeleteSkippedNotice'
import { MeleteSubjectRow } from '../MeleteSubjectRow'

export function MeleteToday(): ReactElement {
  const { today, isLoading, error } = useMeleteToday()
  const [ isRootOpen, setIsRootOpen ] = useState( false )

  if( isLoading ) {
    return <Typography role="status">Loading Melete…</Typography>
  }

  if( today === null ) {
    return <Alert severity="error">{ error ?? 'Could not load Melete' }</Alert>
  }

  const root = today.learning_root
  const dialog = isRootOpen
    ? <LearningRootSetup currentRoot={ root } onClose={ () => setIsRootOpen( false ) } />
    : null

  if( root === null ) {
    return (
      <Stack spacing={ 2 } sx={ { width: '100%', maxWidth: '40rem' } }>
        <Typography variant="h5" component="h2">Melete</Typography>
        <Typography>
          Choose a learning root to start. It is one folder in your vault; each folder directly
          under it becomes a subject you can study.
        </Typography>
        <Button
          variant="contained"
          sx={ { alignSelf: 'flex-start', minHeight: 44 } }
          onClick={ () => setIsRootOpen( true ) }
        >
          Choose learning root
        </Button>
        { dialog }
      </Stack>
    )
  }

  const { due, new_remaining: newRemaining } = today.totals

  return (
    <Stack spacing={ 2 } sx={ { width: '100%', maxWidth: '40rem' } }>
      <Stack direction="row" sx={ { alignItems: 'center', justifyContent: 'space-between' } }>
        <Typography variant="h5" component="h2">Today</Typography>
        <IconButton
          aria-label="Change learning root"
          sx={ { width: 44, height: 44 } }
          onClick={ () => setIsRootOpen( true ) }
        >
          <SettingsIcon />
        </IconButton>
      </Stack>
      <MeleteSkippedNotice paths={ today.skipped_paths } />
      <Typography variant="h6" component="p">{ `${ due } due · ${ newRemaining } new` }</Typography>
      <Button
        component={ RouterLink }
        to="/melete/review"
        variant="contained"
        size="large"
        disabled={ due + newRemaining === 0 }
        sx={ { minHeight: 48 } }
      >
        Review all due
      </Button>
      { today.subjects.length === 0 && (
        <Typography color="text.secondary">
          { `No subjects yet. Make a folder in ${ root } in Obsidian and it appears here.` }
        </Typography>
      ) }
      { today.subjects.map( ( subject ) => (
        <MeleteSubjectRow key={ subject.id } subject={ subject } />
      ) ) }
      { dialog }
    </Stack>
  )
}

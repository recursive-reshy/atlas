// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// App
import { useMe } from '#src/app/useMe'
import { LinkingSettings } from '../LinkingSettings'
import { MeleteSettings } from '#src/components/MeleteSettings'
import { SummarizerDefaults } from '../SummarizerDefaults'

export function ModelsTab(): ReactElement {
  const modules = useMe().me?.modules ?? []

  return (
    <Stack spacing={ 3 } sx={ { width: '100%', maxWidth: '40rem' } }>
      { modules.includes( 'transcriber' ) && (
        <>
          <Typography variant="h6" component="h3">Summarizer</Typography>
          <SummarizerDefaults />
          <Typography variant="h6" component="h3">Linking</Typography>
          <LinkingSettings />
        </>
      ) }
      { modules.includes( 'melete' ) && (
        <>
          <Typography variant="h6" component="h3">Melete</Typography>
          <MeleteSettings />
        </>
      ) }
    </Stack>
  )
}

// React
import type { ReactElement, ReactNode } from 'react'
// Packages
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

const PAGE_SX = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  p: 2,
} as const

type GatePageProps = {
  title: string
  children: ReactNode
}

// The bare, centred page the gate shows before the app: no drawer, no navigation.
export function GatePage( { title, children }: GatePageProps ): ReactElement {
  return (
    <Box component="main" sx={ PAGE_SX }>
      <Paper variant="outlined" sx={ { width: '100%', maxWidth: '28rem', p: 3 } }>
        <Stack spacing={ 2 }>
          <Typography variant="overline" component="p" color="text.secondary">
            Atlas
          </Typography>
          <Typography variant="h5" component="h1">{ title }</Typography>
          { children }
        </Stack>
      </Paper>
    </Box>
  )
}

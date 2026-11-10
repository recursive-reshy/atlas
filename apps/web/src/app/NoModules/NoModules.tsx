// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
// App
import { useSignOut } from '../useSignOut'
import { GatePage } from '../GatePage'

export function NoModules(): ReactElement {
  const signOut = useSignOut()

  return (
    <GatePage title="No modules yet">
      <Typography color="text.secondary">
        The admin hasn't switched on anything for you yet. Ask them, then reload this page.
      </Typography>
      <Button variant="outlined" onClick={ () => signOut.mutate() }>Sign out</Button>
    </GatePage>
  )
}

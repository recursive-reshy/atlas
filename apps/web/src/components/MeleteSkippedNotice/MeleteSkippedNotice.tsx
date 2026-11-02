// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

type MeleteSkippedNoticeProps = { paths: string[] }

const FOLD_AFTER = 5
const LIST_SX = { my: 0.5, pl: 2.5, overflowWrap: 'anywhere' } as const

export function MeleteSkippedNotice( { paths }: MeleteSkippedNoticeProps ): ReactElement | null {
  const [ isShown, setIsShown ] = useState( false )

  if( paths.length === 0 ) {
    return null
  }

  const isFolded = paths.length > FOLD_AFTER
  const noun = paths.length === 1 ? 'folder or note' : 'folders or notes'

  return (
    <Alert severity="warning">
      <AlertTitle>{ `Melete couldn't read ${ paths.length } ${ noun } in your vault` }</AlertTitle>
      <Typography variant="body2">
        They are left as they were, and their questions stay in review. Check their permissions;
        the notice goes once a scan can read them.
      </Typography>
      { isFolded && (
        <Button size="small" sx={ { minHeight: 44 } } onClick={ () => setIsShown( !isShown ) }>
          { isShown ? 'Hide' : 'Show' }
        </Button>
      ) }
      { ( !isFolded || isShown ) && (
        <Typography component="ul" variant="body2" sx={ LIST_SX }>
          { paths.map( ( path ) => <li key={ path }>{ path }</li> ) }
        </Typography>
      ) }
    </Alert>
  )
}

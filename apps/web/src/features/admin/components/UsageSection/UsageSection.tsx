// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// Shared
import type { AdminUser } from '@atlas/shared'
// App
import { useAdminUsage } from '#src/features/admin/hooks/useAdminUsage'
import { UsageTable } from './UsageTable'

const MONTHS_SHOWN = 12

// The current month and the ones before it, newest first.
const monthOptions = ( current: string ): string[] => {
  const [ year, month ] = current.split( '-' ).map( Number )

  return Array.from( { length: MONTHS_SHOWN }, ( _, back ) => {
    const index = year * 12 + ( month - 1 ) - back

    return `${ Math.floor( index / 12 ) }-${ String( ( index % 12 ) + 1 ).padStart( 2, '0' ) }`
  } )
}

type UsageSectionProps = {
  users: AdminUser[]
}

export function UsageSection( { users }: UsageSectionProps ): ReactElement {
  const [ month, setMonth ] = useState< string | null >( null )
  const current = useAdminUsage( null ).usage
  const { usage, isLoading, error } = useAdminUsage( month )
  const options = current === null ? [] : monthOptions( current.month )

  return (
    <Stack spacing={ 2 }>
      <Typography variant="h6" component="h3">Usage</Typography>
      <TextField
        select
        size="small"
        label="Month"
        value={ month ?? current?.month ?? '' }
        onChange={ ( event ) => setMonth( event.target.value ) }
        disabled={ options.length === 0 }
        sx={ { maxWidth: '12rem' } }
      >
        { options.map( ( option ) => (
          <MenuItem key={ option } value={ option }>{ option }</MenuItem>
        ) ) }
      </TextField>
      { usage !== null && (
        <Typography variant="body2" color="text.secondary">
          { `Months are in ${ usage.time_zone }. Cost is an estimate from the recorded runs.` }
        </Typography>
      ) }
      { isLoading && <Typography role="status">Loading usage…</Typography> }
      { error !== null && <Alert severity="error">{ error }</Alert> }
      { usage !== null && <UsageTable usage={ usage } users={ users } /> }
    </Stack>
  )
}

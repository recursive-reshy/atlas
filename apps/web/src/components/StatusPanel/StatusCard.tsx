// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import ListItem from '@mui/material/ListItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { StatusRow } from '@atlas/shared'
// App
import { formatAgo } from '#src/checkedAt'
import { BackupControls } from './BackupControls'
import { ErrorHistory } from './ErrorHistory'
import { RowControls } from './RowControls'
import { StateCell } from './StateCell'
import { KIND_LABELS } from './statusLabels'

interface StatusCardProps {
  row: StatusRow
  now: number
}

const ITEM_SX = { display: 'block', borderBottom: 1, borderColor: 'divider', py: 1.5 }

const ago = ( at: string | null, now: number ): string => {
  return at === null ? 'never' : formatAgo( at, now )
}

export function StatusCard( { row, now }: StatusCardProps ): ReactElement {
  const [ isOpen, setIsOpen ] = useState( false )

  return (
    <ListItem disableGutters sx={ ITEM_SX }>
      <Stack spacing={ 0.5 }>
        <Stack direction="row" sx={ { justifyContent: 'space-between', gap: 1 } }>
          <Typography sx={ { fontWeight: 600, overflowWrap: 'anywhere' } }>{ row.name }</Typography>
          <StateCell state={ row.state } />
        </Stack>
        <Typography variant="body2" color="text.secondary">{ KIND_LABELS[ row.kind ] }</Typography>
        { row.detail !== null && (
          <Typography variant="body2" color="text.secondary" sx={ { overflowWrap: 'anywhere' } }>
            { row.detail }
          </Typography>
        ) }
        <Typography variant="body2" color="text.secondary">
          { `Last checked: ${ ago( row.last_checked_at, now ) }` }
        </Typography>
        <Typography variant="body2" color="text.secondary">
          { `Last success: ${ ago( row.last_success_at, now ) }` }
        </Typography>
        <RowControls row={ row } isOpen={ isOpen } onToggle={ () => setIsOpen( !isOpen ) } />
        { row.kind === 'backup' && <BackupControls /> }
        { isOpen && row.state === 'failing' && (
          <ErrorHistory kind={ row.kind } id={ row.id } name={ row.name } />
        ) }
      </Stack>
    </ListItem>
  )
}

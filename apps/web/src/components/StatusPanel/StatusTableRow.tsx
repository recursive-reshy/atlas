// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Collapse from '@mui/material/Collapse'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
// Shared
import type { StatusRow } from '@atlas/shared'
// App
import { formatAgo } from '#src/checkedAt'
import { ErrorHistory } from './ErrorHistory'
import { RowControls } from './RowControls'
import { StateCell } from './StateCell'
import { KIND_LABELS } from './statusLabels'

interface StatusTableRowProps {
  row: StatusRow
  now: number
}

const NAME_SX = { fontWeight: 600, overflowWrap: 'anywhere' }

const ago = ( at: string | null, now: number ): string => {
  return at === null ? 'never' : formatAgo( at, now )
}

export function StatusTableRow( { row, now }: StatusTableRowProps ): ReactElement {
  const [ isOpen, setIsOpen ] = useState( false )
  const isShowingHistory = isOpen && row.state === 'failing'

  return (
    <>
      <TableRow sx={ { '& > td': { borderBottom: isShowingHistory ? 'none' : undefined } } }>
        <TableCell>
          <Typography sx={ NAME_SX }>{ row.name }</Typography>
          <Typography variant="body2" color="text.secondary">
            { KIND_LABELS[ row.kind ] }
          </Typography>
          { row.detail !== null && (
            <Typography variant="body2" color="text.secondary" sx={ { overflowWrap: 'anywhere' } }>
              { row.detail }
            </Typography>
          ) }
        </TableCell>
        <TableCell>{ ago( row.last_checked_at, now ) }</TableCell>
        <TableCell>{ ago( row.last_success_at, now ) }</TableCell>
        <TableCell>
          <StateCell state={ row.state } />
          <RowControls row={ row } isOpen={ isOpen } onToggle={ () => setIsOpen( !isOpen ) } />
        </TableCell>
      </TableRow>
      { isShowingHistory && (
        <TableRow>
          <TableCell colSpan={ 4 }>
            <Collapse in>
              <ErrorHistory kind={ row.kind } id={ row.id } name={ row.name } />
            </Collapse>
          </TableCell>
        </TableRow>
      ) }
    </>
  )
}

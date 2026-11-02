// React
import type { ReactElement } from 'react'
// Packages
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
// Shared
import type {
  AdminUser,
  UsageCategory,
  UsageResponse,
  UserUsage,
} from '@atlas/shared'
// App
import { formatCost, formatMinutes, sumCost } from './usageFormat'

const CATEGORIES: { key: UsageCategory, label: string }[] = [
  { key: 'summary', label: 'Summaries' },
  { key: 'linking', label: 'Linking' },
  { key: 'melete', label: 'Melete' },
  { key: 'extraction', label: 'Extraction' },
]

type PairProps = {
  month: string
  allTime: string
}

function Pair( { month, allTime }: PairProps ): ReactElement {
  return (
    <>
      <Typography variant="body2">{ month }</Typography>
      <Typography variant="caption" color="text.secondary">{ `All time ${ allTime }` }</Typography>
    </>
  )
}

const claudeCost = ( usage: UserUsage, period: 'month' | 'all_time' ): number | null => {
  return sumCost( CATEGORIES.map( ( { key } ) => usage[ period ][ key ].cost_usd ) )
}

type UsageTableProps = {
  usage: UsageResponse
  users: AdminUser[]
}

export function UsageTable( { usage, users }: UsageTableProps ): ReactElement {
  const nameOf = ( id: string ): string => users.find( ( user ) => user.id === id )?.name ?? id

  return (
    <TableContainer component={ Paper } variant="outlined">
      <Table size="small" aria-label={ `Usage for ${ usage.month }` }>
        <TableHead>
          <TableRow>
            <TableCell>User</TableCell>
            { CATEGORIES.map( ( { key, label } ) => <TableCell key={ key }>{ label }</TableCell> ) }
            <TableCell>Transcription</TableCell>
            <TableCell>Total Claude</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          { usage.users.map( ( row ) => (
            <TableRow key={ row.user_id }>
              <TableCell component="th" scope="row">{ nameOf( row.user_id ) }</TableCell>
              { CATEGORIES.map( ( { key } ) => (
                <TableCell key={ key }>
                  <Pair
                    month={ formatCost( row.month[ key ].cost_usd ) }
                    allTime={ formatCost( row.all_time[ key ].cost_usd ) }
                  />
                </TableCell>
              ) ) }
              <TableCell>
                <Pair
                  month={ formatMinutes( row.transcription.month_seconds ) }
                  allTime={ formatMinutes( row.transcription.all_time_seconds ) }
                />
              </TableCell>
              <TableCell>
                <Pair
                  month={ formatCost( claudeCost( row, 'month' ) ) }
                  allTime={ formatCost( claudeCost( row, 'all_time' ) ) }
                />
              </TableCell>
            </TableRow>
          ) ) }
        </TableBody>
      </Table>
    </TableContainer>
  )
}

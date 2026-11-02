// React
import { useEffect } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import List from '@mui/material/List'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
// App
import { useRefreshStatus } from '#src/hooks/useRefreshStatus'
import { useStatus } from '#src/hooks/useStatus'
import { StatusCard } from './StatusCard'
import { StatusTableRow } from './StatusTableRow'

const COLUMNS = [ 'Name', 'Last checked', 'Last success', 'Status' ] as const

export function StatusPanel(): ReactElement {
  const {
    rows,
    updatedAt,
    isLoading,
    error,
  } = useStatus()
  const { mutate: refresh } = useRefreshStatus()
  const isNarrow = useMediaQuery( useTheme().breakpoints.down( 'sm' ) )

  // One check of the app's services when the panel opens, as well as the background one.
  useEffect( () => {
    refresh()
  }, [ refresh ] )

  return (
    <Stack spacing={ 2 }>
      <Typography variant="h6" component="h3">Status</Typography>
      { isLoading && <Typography role="status">Loading status…</Typography> }
      { error !== null && <Alert severity="error">{ error }</Alert> }
      { !isLoading && error === null && isNarrow && (
        <List aria-label="Status" disablePadding>
          { rows.map( ( row ) => (
            <StatusCard key={ `${ row.kind }:${ row.id }` } row={ row } now={ updatedAt } />
          ) ) }
        </List>
      ) }
      { !isLoading && error === null && !isNarrow && (
        <TableContainer>
          <Table size="small" aria-label="Status">
            <TableHead>
              <TableRow>
                { COLUMNS.map( ( column ) => <TableCell key={ column }>{ column }</TableCell> ) }
              </TableRow>
            </TableHead>
            <TableBody>
              { rows.map( ( row ) => (
                <StatusTableRow key={ `${ row.kind }:${ row.id }` } row={ row } now={ updatedAt } />
              ) ) }
            </TableBody>
          </Table>
        </TableContainer>
      ) }
    </Stack>
  )
}

// React
import { useState } from 'react'
import type { MouseEvent, ReactElement } from 'react'
// Packages
import MoreVertIcon from '@mui/icons-material/MoreVert'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
// Shared
import type { GmailSource, UpdateGmailSourceBody } from '@atlas/shared'
// App
import { formatChecked } from '#src/lib/checkedAt'
import { GmailSourceMatch } from './GmailSourceMatch'

const LIST_SX = { display: 'flex', flexDirection: 'column', gap: 1, width: '100%' } as const

const ITEM_SX = {
  display: 'block',
  px: 2,
  py: 1,
  border: 1,
  borderColor: 'divider',
  borderRadius: 1,
} as const

const WRAP_SX = { overflowWrap: 'anywhere' } as const

const DESTINATION_LABELS: Record< GmailSource[ 'destination' ], string > = {
  newsletter: 'Newsletter',
  jobs: 'Freelance jobs',
}

interface GmailSourceListProps {
  sources: GmailSource[]
  now: number
  checkingId: string | null
  disabled: boolean
  onUpdate: ( id: string, body: UpdateGmailSourceBody ) => void
  onCheck: ( id: string ) => void
  onEdit: ( source: GmailSource ) => void
  onDelete: ( source: GmailSource ) => void
}

interface MenuState {
  source: GmailSource
  anchor: HTMLElement
}

const countText = ( { destination, inbox_count, postings_count }: GmailSource ): string => {
  if( destination === 'newsletter' ) {
    return `${ inbox_count } in inbox`
  }

  return `${ postings_count } ${ postings_count === 1 ? 'posting' : 'postings' } collected`
}

export function GmailSourceList(
  {
    sources,
    now,
    checkingId,
    disabled,
    onUpdate,
    onCheck,
    onEdit,
    onDelete,
  }: GmailSourceListProps,
): ReactElement {
  const [ menu, setMenu ] = useState< MenuState | null >( null )

  if( sources.length === 0 ) {
    return <Typography color="text.secondary">No sources yet.</Typography>
  }

  const handleOpen = ( source: GmailSource ) => ( event: MouseEvent< HTMLElement > ): void => {
    setMenu( { source, anchor: event.currentTarget } )
  }

  const handleAction = ( action: ( source: GmailSource ) => void ) => (): void => {
    if( menu !== null ) {
      action( menu.source )
    }

    setMenu( null )
  }

  return (
    <>
      <List aria-label="Gmail sources" disablePadding sx={ LIST_SX }>
        { sources.map( ( source ) => (
          <ListItem key={ source.id } sx={ ITEM_SX }>
            <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'flex-start' } }>
              <Stack spacing={ 0.5 } sx={ { flex: 1, minWidth: 0 } }>
                <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'center' } }>
                  <Typography sx={ { fontWeight: 600, ...WRAP_SX } }>{ source.name }</Typography>
                  <Chip size="small" label={ DESTINATION_LABELS[ source.destination ] } />
                </Stack>
                <GmailSourceMatch source={ source } />
                <Typography variant="body2" color="text.secondary">
                  { checkingId === source.id
                    ? 'Checking…'
                    : formatChecked( source.last_checked_at, now ) }
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  { countText( source ) }
                </Typography>
                { source.last_skipped_count > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    { `${ source.last_skipped_count } skipped in the last check` }
                  </Typography>
                ) }
                { source.auto_summarize && (
                  <Typography variant="body2" color="text.secondary">
                    Summarizes automatically
                  </Typography>
                ) }
              </Stack>
              <IconButton
                aria-label={ `${ source.name } actions` }
                onClick={ handleOpen( source ) }
              >
                <MoreVertIcon />
              </IconButton>
            </Stack>
            { source.last_error !== null && (
              <Alert severity="warning" sx={ { mt: 1 } }>{ source.last_error }</Alert>
            ) }
            <FormControlLabel
              label="On"
              control={ (
                <Switch
                  checked={ source.enabled }
                  disabled={ disabled }
                  onChange={ ( event ) => onUpdate( source.id, { enabled: event.target.checked } ) }
                />
              ) }
            />
          </ListItem>
        ) ) }
      </List>
      <Menu
        anchorEl={ menu?.anchor ?? null }
        open={ menu !== null }
        onClose={ () => setMenu( null ) }
      >
        <MenuItem
          onClick={ handleAction( ( { id } ) => onCheck( id ) ) }
          disabled={ disabled || menu?.source.id === checkingId }
        >
          Check now
        </MenuItem>
        <MenuItem onClick={ handleAction( onEdit ) } disabled={ disabled }>Edit</MenuItem>
        <MenuItem onClick={ handleAction( onDelete ) }>Delete</MenuItem>
      </Menu>
    </>
  )
}

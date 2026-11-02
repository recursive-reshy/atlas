// React
import { useState } from 'react'
import type { MouseEvent, ReactElement } from 'react'
// Packages
import MoreVertIcon from '@mui/icons-material/MoreVert'
import Alert from '@mui/material/Alert'
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
import type {
  Feed,
  PromptProfile,
  UpdateFeedBody,
} from '@atlas/shared'
// App
import { formatChecked } from '#src/checkedAt'

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

interface FeedListProps {
  feeds: Feed[]
  profiles: PromptProfile[]
  now: number
  checkingId: string | null
  onUpdate: ( id: string, body: UpdateFeedBody ) => void
  onCheck: ( id: string ) => void
  onEdit: ( feed: Feed ) => void
  onDelete: ( feed: Feed ) => void
}

interface MenuState {
  feed: Feed
  anchor: HTMLElement
}

export function FeedList(
  { feeds, profiles, now, checkingId, onUpdate, onCheck, onEdit, onDelete }: FeedListProps,
): ReactElement {
  const [ menu, setMenu ] = useState< MenuState | null >( null )

  if( feeds.length === 0 ) {
    return <Typography color="text.secondary">No feeds yet.</Typography>
  }

  const profileName = ( { profile_id }: Feed ): string => {
    return profiles.find( ( { id } ) => id === profile_id )?.name ?? 'Default profile'
  }

  const handleOpen = ( feed: Feed ) => ( event: MouseEvent< HTMLElement > ): void => {
    setMenu( { feed, anchor: event.currentTarget } )
  }

  const handleAction = ( action: ( feed: Feed ) => void ) => (): void => {
    if( menu !== null ) {
      action( menu.feed )
    }

    setMenu( null )
  }

  return (
    <>
      <List aria-label="Feeds" disablePadding sx={ LIST_SX }>
        { feeds.map( ( feed ) => (
          <ListItem key={ feed.id } sx={ ITEM_SX }>
            <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'flex-start' } }>
              <Stack sx={ { flex: 1, minWidth: 0 } }>
                <Typography sx={ { fontWeight: 600, ...WRAP_SX } }>{ feed.name }</Typography>
                <Typography variant="body2" color="text.secondary" sx={ WRAP_SX }>
                  { feed.feed_url }
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  { `Profile: ${ profileName( feed ) }` }
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  { checkingId === feed.id
                    ? 'Checking…'
                    : formatChecked( feed.last_checked_at, now ) }
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  { `${ feed.inbox_count } in inbox` }
                </Typography>
                { feed.last_skipped_count > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    { `${ feed.last_skipped_count } skipped in the last check` }
                  </Typography>
                ) }
              </Stack>
              <IconButton aria-label={ `${ feed.name } actions` } onClick={ handleOpen( feed ) }>
                <MoreVertIcon />
              </IconButton>
            </Stack>
            { feed.last_error !== null && (
              <Alert severity="warning" sx={ { mt: 1 } }>{ feed.last_error }</Alert>
            ) }
            <Stack direction="row" spacing={ 2 }>
              <FormControlLabel
                label="On"
                control={ (
                  <Switch
                    checked={ feed.enabled }
                    onChange={ ( event ) => onUpdate( feed.id, { enabled: event.target.checked } ) }
                  />
                ) }
              />
              <FormControlLabel
                label="Summarize automatically"
                control={ (
                  <Switch
                    checked={ feed.auto_summarize }
                    onChange={ ( event ) => {
                      onUpdate( feed.id, { auto_summarize: event.target.checked } )
                    } }
                  />
                ) }
              />
            </Stack>
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
          disabled={ menu?.feed.id === checkingId }
        >
          Check now
        </MenuItem>
        <MenuItem onClick={ handleAction( onEdit ) }>Edit</MenuItem>
        <MenuItem onClick={ handleAction( onDelete ) }>Delete</MenuItem>
      </Menu>
    </>
  )
}

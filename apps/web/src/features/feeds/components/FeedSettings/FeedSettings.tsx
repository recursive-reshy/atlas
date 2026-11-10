// React
import { useState } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// Shared
import { FeedCheckInterval } from '@atlas/shared'
// App
import { useFeeds } from '#src/features/feeds/hooks/useFeeds'
import { useMe } from '#src/app/useMe'
import { usePromptProfiles } from '#src/hooks/usePromptProfiles'
import { useSettings } from '#src/hooks/useSettings'
import { FeedList } from '../FeedList'
import { FeedDialogs } from './FeedDialogs'
import type { FeedDialog } from './FeedDialogs'

const INTERVAL_LABELS: Record< FeedCheckInterval, string > = {
  15: '15 minutes',
  30: '30 minutes',
  60: '1 hour',
  180: '3 hours',
  360: '6 hours',
  1440: 'Daily',
}

const INTERVALS = FeedCheckInterval.options.map( ( { value } ) => value )

export function FeedSettings(): ReactElement {
  const { settings, updateSettings } = useSettings()
  const { profiles } = usePromptProfiles()
  const feeds = useFeeds()
  const isAdmin = useMe().me?.role === 'admin'
  const [ dialog, setDialog ] = useState< FeedDialog | null >( null )
  const failure = [ feeds.updateFeed, feeds.checkFeed, feeds.checkAllFeeds, updateSettings ]
    .find( ( mutation ) => mutation.isError )?.error

  const handleClose = (): void => {
    setDialog( null )
    feeds.createFeed.reset()
    feeds.updateFeed.reset()
    feeds.deleteFeed.reset()
  }

  const handleInterval = ( event: ChangeEvent< HTMLInputElement > ): void => {
    updateSettings.mutate( { feed_check_interval_minutes: FeedCheckInterval.parse(
      Number( event.target.value ),
    ) } )
  }

  return (
    <Stack spacing={ 2 }>
      <Typography variant="h6" component="h3">Feeds</Typography>
      <Stack direction={ { xs: 'column', sm: 'row' } } spacing={ 1 }>
        { isAdmin && (
          <TextField
            select
            size="small"
            label="Check feeds every"
            value={ settings?.feed_check_interval_minutes ?? '' }
            onChange={ handleInterval }
            disabled={ settings === null }
            sx={ { flex: 1 } }
          >
            { INTERVALS.map( ( minutes ) => (
              <MenuItem key={ minutes } value={ minutes }>{ INTERVAL_LABELS[ minutes ] }</MenuItem>
            ) ) }
          </TextField>
        ) }
        <Button
          variant="outlined"
          onClick={ () => feeds.checkAllFeeds.mutate() }
          disabled={ feeds.checkAllFeeds.isPending }
        >
          { feeds.checkAllFeeds.isPending ? 'Checking…' : 'Check all now' }
        </Button>
        <Button variant="contained" onClick={ () => setDialog( { kind: 'add' } ) }>
          Add feed
        </Button>
      </Stack>
      <Typography role="status" variant="body2" color="text.secondary">
        { updateSettings.isSuccess ? 'Saved' : '' }
      </Typography>
      { failure && <Alert severity="error">{ failure.message }</Alert> }
      { feeds.isLoading && <Typography role="status">Loading feeds…</Typography> }
      { feeds.error !== null && <Alert severity="error">{ feeds.error }</Alert> }
      { !feeds.isLoading && feeds.error === null && (
        <FeedList
          feeds={ feeds.feeds }
          profiles={ profiles }
          now={ feeds.updatedAt }
          checkingId={ feeds.checkFeed.isPending ? feeds.checkFeed.variables ?? null : null }
          onUpdate={ ( id, body ) => feeds.updateFeed.mutate( { id, body } ) }
          onCheck={ ( id ) => feeds.checkFeed.mutate( id ) }
          onEdit={ ( feed ) => setDialog( { kind: 'edit', feed } ) }
          onDelete={ ( feed ) => setDialog( { kind: 'delete', feed } ) }
        />
      ) }
      <FeedDialogs
        dialog={ dialog }
        profiles={ profiles }
        feeds={ feeds }
        onClose={ handleClose }
      />
    </Stack>
  )
}

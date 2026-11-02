// React
import type { ReactElement } from 'react'
// Shared
import type { Feed, PromptProfile } from '@atlas/shared'
// App
import type { FeedsState } from '#src/hooks/useFeeds'
import { AddFeedDialog } from '../AddFeedDialog'
import { DeleteFeedDialog } from '../DeleteFeedDialog'
import { EditFeedDialog } from '../EditFeedDialog'

export type FeedDialog =
  | { kind: 'add' }
  | { kind: 'edit', feed: Feed }
  | { kind: 'delete', feed: Feed }

interface FeedDialogsProps {
  dialog: FeedDialog | null
  profiles: PromptProfile[]
  feeds: FeedsState
  onClose: () => void
}

export function FeedDialogs(
  { dialog, profiles, feeds, onClose }: FeedDialogsProps,
): ReactElement | null {
  const done = { onSuccess: onClose }

  if( dialog?.kind === 'add' ) {
    return (
      <AddFeedDialog
        profiles={ profiles }
        isSubmitting={ feeds.createFeed.isPending }
        error={ feeds.createFeed.error?.message ?? null }
        onSubmit={ ( body ) => feeds.createFeed.mutate( body, done ) }
        onCancel={ onClose }
      />
    )
  }

  if( dialog?.kind === 'edit' ) {
    return (
      <EditFeedDialog
        feed={ dialog.feed }
        profiles={ profiles }
        isSubmitting={ feeds.updateFeed.isPending }
        error={ feeds.updateFeed.error?.message ?? null }
        onSubmit={ ( body ) => feeds.updateFeed.mutate( { id: dialog.feed.id, body }, done ) }
        onCancel={ onClose }
      />
    )
  }

  if( dialog?.kind === 'delete' ) {
    return (
      <DeleteFeedDialog
        feed={ dialog.feed }
        isDeleting={ feeds.deleteFeed.isPending }
        error={ feeds.deleteFeed.error?.message ?? null }
        onConfirm={ ( removeItems ) => {
          feeds.deleteFeed.mutate( { id: dialog.feed.id, removeItems }, done )
        } }
        onCancel={ onClose }
      />
    )
  }

  return null
}

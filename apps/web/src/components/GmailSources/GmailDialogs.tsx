// React
import type { ReactElement } from 'react'
// Shared
import type { GmailSource, PromptProfile } from '@atlas/shared'
// App
import type { GmailSourcesState } from '#src/hooks/useGmailSources'
import { AddGmailSourceDialog } from '../AddGmailSourceDialog'
import { DeleteGmailSourceDialog } from '../DeleteGmailSourceDialog'
import { EditGmailSourceDialog } from '../EditGmailSourceDialog'

export type GmailDialog =
  | { kind: 'add' }
  | { kind: 'edit', source: GmailSource }
  | { kind: 'delete', source: GmailSource }

interface GmailDialogsProps {
  dialog: GmailDialog | null
  profiles: PromptProfile[]
  sources: GmailSourcesState
  onClose: () => void
}

export function GmailDialogs(
  { dialog, profiles, sources, onClose }: GmailDialogsProps,
): ReactElement | null {
  const done = { onSuccess: onClose }

  if( dialog?.kind === 'add' ) {
    return (
      <AddGmailSourceDialog
        profiles={ profiles }
        isSubmitting={ sources.createSource.isPending }
        error={ sources.createSource.error?.message ?? null }
        onSubmit={ ( body ) => sources.createSource.mutate( body, done ) }
        onCancel={ onClose }
      />
    )
  }

  if( dialog?.kind === 'edit' ) {
    return (
      <EditGmailSourceDialog
        source={ dialog.source }
        profiles={ profiles }
        isSubmitting={ sources.updateSource.isPending }
        error={ sources.updateSource.error?.message ?? null }
        onSubmit={ ( body ) => {
          sources.updateSource.mutate( { id: dialog.source.id, body }, done )
        } }
        onCancel={ onClose }
      />
    )
  }

  if( dialog?.kind === 'delete' ) {
    return (
      <DeleteGmailSourceDialog
        source={ dialog.source }
        isDeleting={ sources.deleteSource.isPending }
        error={ sources.deleteSource.error?.message ?? null }
        onConfirm={ ( removeInboxItems ) => {
          sources.deleteSource.mutate( { id: dialog.source.id, removeInboxItems }, done )
        } }
        onCancel={ onClose }
      />
    )
  }

  return null
}

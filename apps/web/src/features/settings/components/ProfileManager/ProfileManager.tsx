// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import { useNavigate } from 'react-router'
// App
import { usePromptProfiles } from '#src/features/settings/hooks/usePromptProfiles'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { ConfirmDialog } from '#src/app/ConfirmDialog'
import { ProfileActions } from '../ProfileActions'
import { deleteBlockedReason } from '../ProfileActions/deleteBlockedReason'
import { ProfileNameDialog } from '../ProfileNameDialog'

type Dialog = 'create' | 'rename' | 'delete' | null

interface ProfileManagerProps {
  // A summary profile's id, 'linker', or null when no prompt is selected.
  selectedId: string | null
}

export function ProfileManager( { selectedId }: ProfileManagerProps ): ReactElement {
  const { profiles, createProfile, renameProfile, deleteProfile } = usePromptProfiles()
  const { settings, updateSettings } = useSettings()
  const navigate = useNavigate()
  const [ dialog, setDialog ] = useState< Dialog >( null )
  const defaultId = settings?.default_profile_id
  const profile = profiles.find( ( { id } ) => id === selectedId )

  const open = ( next: 'create' | 'rename' ): void => {
    createProfile.reset()
    renameProfile.reset()
    setDialog( next )
  }

  return (
    <Stack spacing={ 1 }>
      <ProfileActions
        hasProfile={ profile !== undefined }
        isDefault={ profile?.id === defaultId }
        deleteBlockedReason={ profile === undefined
          ? null
          : deleteBlockedReason( profile.id, defaultId, profiles.length ) }
        onNew={ () => open( 'create' ) }
        onRename={ () => open( 'rename' ) }
        onDelete={ () => setDialog( 'delete' ) }
        onSetDefault={ () => updateSettings.mutate( { default_profile_id: profile?.id } ) }
      />
      { deleteProfile.isError && <Alert severity="error">{ deleteProfile.error?.message }</Alert> }
      { updateSettings.isError && (
        <Alert severity="error">{ updateSettings.error?.message }</Alert>
      ) }
      { ( dialog === 'create' || dialog === 'rename' ) && (
        <ProfileNameDialog
          mode={ dialog }
          open
          initialName={ dialog === 'rename' ? profile?.name ?? '' : '' }
          initialGuidance={ profile?.current_version.guidance ?? '' }
          error={ ( dialog === 'create' ? createProfile : renameProfile ).error?.message ?? null }
          isSaving={ createProfile.isPending || renameProfile.isPending }
          onCancel={ () => setDialog( null ) }
          onSubmit={ ( { name, guidance } ) => {
            if( dialog === 'create' ) {
              createProfile.mutate(
                { name, guidance: guidance ?? '' },
                {
                  onSuccess: ( created ) => {
                    setDialog( null )
                    void navigate( `/settings/prompts/${ created.id }` )
                  },
                },
              )
            } else if( profile !== undefined ) {
              renameProfile.mutate(
                { id: profile.id, name },
                { onSuccess: () => setDialog( null ) },
              )
            }
          } }
        />
      ) }
      <ConfirmDialog
        open={ dialog === 'delete' }
        title="Delete this profile?"
        message={ `${ profile?.name ?? 'This profile' } will leave the list. `
          + 'Videos already summarized with it keep its name.' }
        confirmLabel="Delete"
        onConfirm={ () => {
          if( profile !== undefined ) {
            deleteProfile.mutate( profile.id, {
              onSuccess: () => {
                setDialog( null )
                void navigate( '/settings/prompts' )
              },
            } )
          }
        } }
        onCancel={ () => setDialog( null ) }
      />
    </Stack>
  )
}

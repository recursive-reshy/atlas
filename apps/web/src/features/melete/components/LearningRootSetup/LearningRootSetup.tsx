// React
import { useId, useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Stack from '@mui/material/Stack'
// App
import { useFolders } from '#src/features/vault/hooks/useFolders'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { FolderPicker } from '#src/features/vault/components/FolderPicker'

interface LearningRootSetupProps {
  currentRoot: string | null
  onClose: () => void
}

export function LearningRootSetup(
  { currentRoot, onClose }: LearningRootSetupProps,
): ReactElement {
  const titleId = useId()
  const { folders, error: foldersError } = useFolders()
  const { updateSettings } = useSettings()
  const [ folder, setFolder ] = useState< string | null >( null )
  const defaultFolder = currentRoot ?? ''
  const chosen = folder ?? defaultFolder

  const handleSave = (): void => {
    updateSettings.mutate( { melete_learning_root: chosen }, { onSuccess: onClose } )
  }

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={ onClose } aria-labelledby={ titleId }>
      <DialogTitle id={ titleId }>Learning root</DialogTitle>
      <DialogContent>
        <Stack spacing={ 2 }>
          <DialogContentText>
            The learning root is one folder in your vault. Each folder directly under it is a
            subject, and Melete quizzes you on the notes you enroll from those folders.
          </DialogContentText>
          { foldersError === null && (
            <FolderPicker
              folders={ folders }
              defaultFolder={ defaultFolder }
              value={ folder }
              onChange={ setFolder }
            />
          ) }
          { foldersError !== null && (
            <Alert severity="error">
              { `Could not load the vault folders: ${ foldersError }` }
            </Alert>
          ) }
          { updateSettings.error && (
            <Alert severity="error">{ updateSettings.error.message }</Alert>
          ) }
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={ onClose }>Cancel</Button>
        <Button
          variant="contained"
          disabled={ chosen === '' || foldersError !== null || updateSettings.isPending }
          onClick={ handleSave }
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

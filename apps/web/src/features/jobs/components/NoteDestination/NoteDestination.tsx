// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
// App
import { useFolders } from '#src/hooks/useFolders'
import { FilenamePreview } from '../FilenamePreview'
import { FolderPicker } from '#src/components/FolderPicker'

interface NoteDestinationProps {
  title: string
  defaultFolder: string
  folder: string | null
  onFolderChange: ( folder: string | null ) => void
}

export function NoteDestination(
  { title, defaultFolder, folder, onFolderChange }: NoteDestinationProps,
): ReactElement {
  const { folders, error } = useFolders()

  return (
    <>
      { error === null && (
        <FolderPicker
          folders={ folders }
          defaultFolder={ defaultFolder }
          value={ folder }
          onChange={ onFolderChange }
        />
      ) }
      { error !== null && (
        <Alert severity="error">
          { `Could not load the vault folders: ${ error }. The note goes to the default folder.` }
        </Alert>
      ) }
      <FilenamePreview title={ title } folder={ folder ?? defaultFolder } />
    </>
  )
}

// React
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
// Shared
import { isValidFolderName } from '@atlas/shared'
import type { FolderNode } from '@atlas/shared'
// App
import { filterTree, withExtraFolders } from './treeNodes'
import { FolderTree } from './FolderTree'

interface FolderPickerProps {
  folders: FolderNode[]
  defaultFolder: string
  value: string | null
  onChange: ( folder: string | null ) => void
}

const NAME_MESSAGE = 'Folder names can\'t be empty, longer than 100 characters, '
  + 'start with a dot or contain / \\ : * ? " < > |.'

export function FolderPicker(
  { folders, defaultFolder, value, onChange }: FolderPickerProps,
): ReactElement {
  const [ isOpen, setIsOpen ] = useState( false )
  const [ query, setQuery ] = useState( '' )
  const [ name, setName ] = useState( '' )
  const [ message, setMessage ] = useState< string | null >( null )
  const [ added, setAdded ] = useState< string[] >( [] )

  const chosenPath = value ?? defaultFolder
  const tree = withExtraFolders( folders, [ ...added, defaultFolder, chosenPath ] )
  const visible = filterTree( tree, query )

  const handleSelect = ( path: string ): void => {
    onChange( path === defaultFolder ? null : path )
  }

  const handleCreate = ( event: FormEvent ): void => {
    event.preventDefault()
    const trimmed = name.trim()

    if( !isValidFolderName( trimmed ) ) {
      setMessage( NAME_MESSAGE )

      return
    }

    const path = chosenPath === '' ? trimmed : `${ chosenPath }/${ trimmed }`

    setMessage( null )
    setName( '' )
    setAdded( [ ...added, path ] )
    handleSelect( path )
  }

  return (
    <Stack spacing={ 1 } sx={ { width: '100%' } }>
      <Box sx={ { display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' } }>
        <Typography component="span">
          Folder: <code>{ chosenPath === '' ? 'Vault root' : chosenPath }</code>
        </Typography>
        <Button
          size="small"
          variant="outlined"
          aria-expanded={ isOpen }
          onClick={ () => setIsOpen( !isOpen ) }
        >
          Change folder
        </Button>
      </Box>
      { isOpen && (
        <Paper variant="outlined" sx={ { p: 1 } }>
          <Stack spacing={ 1 }>
            <TextField
              label="Filter folders"
              size="small"
              value={ query }
              onChange={ ( event ) => setQuery( event.target.value ) }
            />
            <FolderTree
              nodes={ visible }
              chosenPath={ chosenPath }
              newestPath={ added.at( -1 ) ?? null }
              isFiltering={ query.trim() !== '' }
              onSelect={ handleSelect }
            />
            { visible.length === 0 && <Typography>No folders match</Typography> }
            <Stack
              component="form"
              direction="row"
              spacing={ 1 }
              sx={ { alignItems: 'flex-start' } }
              onSubmit={ handleCreate }
            >
              <TextField
                label="New folder name"
                size="small"
                value={ name }
                onChange={ ( event ) => setName( event.target.value ) }
              />
              <Button type="submit" variant="outlined">New folder</Button>
            </Stack>
            { message !== null && <Alert severity="error">{ message }</Alert> }
          </Stack>
        </Paper>
      ) }
    </Stack>
  )
}

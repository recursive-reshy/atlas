// React
import type { ReactElement } from 'react'
// Packages
import Typography from '@mui/material/Typography'
// Shared
import { noteBasename } from '@atlas/shared'
// App

const WRAP_STYLE = { overflowWrap: 'anywhere' } as const

interface FilenamePreviewProps {
  title: string
  folder: string | null
}

export function FilenamePreview( { title, folder }: FilenamePreviewProps ): ReactElement {
  const fileName = `${ noteBasename( title ) }.md`

  if( folder === null ) {
    return (
      <Typography variant="body2" color="text.secondary">
        Saved in the default folder as <code style={ WRAP_STYLE }>{ fileName }</code>
      </Typography>
    )
  }

  const path = folder === '' ? fileName : `${ folder }/${ fileName }`

  return (
    <Typography variant="body2" color="text.secondary">
      Saved as <code style={ WRAP_STYLE }>{ path }</code>
    </Typography>
  )
}

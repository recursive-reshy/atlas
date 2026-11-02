// React
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import { usePublisher, useCellValue, viewMode$ } from '@mdxeditor/editor'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
// Shared
import { parseNote } from '@atlas/shared'

export type NoteEditorMode = 'rich-text' | 'source'

interface ModeToggleProps {
  getNote: () => string
  onModeChange: ( mode: NoteEditorMode ) => void
}

const MODES = [
  { mode: 'rich-text', label: 'Rich text' },
  { mode: 'source', label: 'Source mode' },
] as const

const hasValidFrontmatter = ( note: string ): boolean => {
  try {
    parseNote( note )

    return true
  } catch{
    return false
  }
}

export function ModeToggle( { getNote, onModeChange }: ModeToggleProps ): ReactElement {
  const current = useCellValue( viewMode$ )
  const setMode = usePublisher( viewMode$ )
  const [ isBlocked, setIsBlocked ] = useState( false )
  const report = useRef( onModeChange )

  useEffect( () => {
    report.current = onModeChange
  }, [ onModeChange ] )

  useEffect( () => {
    if( current === 'rich-text' || current === 'source' ) {
      report.current( current )
    }
  }, [ current ] )

  const handleSelect = ( mode: NoteEditorMode ): void => {
    // The rich editor cannot open YAML that does not parse.
    const canSwitch = mode === 'source' || hasValidFrontmatter( getNote() )

    setIsBlocked( !canSwitch )

    if( canSwitch ) {
      setMode( mode )
    }
  }

  return (
    <Box sx={ { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 } }>
      <ToggleButtonGroup
        exclusive
        size="small"
        aria-label="Editor mode"
        value={ current }
        onChange={ ( _event, mode: NoteEditorMode | null ) => {
          if( mode !== null ) {
            handleSelect( mode )
          }
        } }
      >
        { MODES.map( ( { mode, label } ) => (
          <ToggleButton key={ mode } value={ mode }>{ label }</ToggleButton>
        ) ) }
      </ToggleButtonGroup>
      { isBlocked && (
        <Alert severity="error">
          Fix the front-matter in source mode before switching to rich text.
        </Alert>
      ) }
    </Box>
  )
}

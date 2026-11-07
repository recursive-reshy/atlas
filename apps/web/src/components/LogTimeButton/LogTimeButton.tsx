// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import AddIcon from '@mui/icons-material/AddOutlined'
import Button from '@mui/material/Button'
import Fab from '@mui/material/Fab'
// App
import { LogTimeDialog } from '../LogTimeDialog'

interface LogTimeButtonProps {
  // Opens the dialog on this subject
  subjectId?: string
  // A round button fixed to the corner, always in view
  isFloating?: boolean
}

const FAB_SX = { position: 'fixed', right: 16, bottom: 16 } as const

export function LogTimeButton(
  { subjectId, isFloating = false }: LogTimeButtonProps,
): ReactElement {
  const [ isOpen, setIsOpen ] = useState( false )

  return (
    <>
      { isFloating ? (
        <Fab
          color="primary"
          aria-label="Log time"
          onClick={ () => setIsOpen( true ) }
          sx={ FAB_SX }
        >
          <AddIcon />
        </Fab>
      ) : (
        <Button
          variant="outlined"
          onClick={ () => setIsOpen( true ) }
          sx={ { minHeight: 44, alignSelf: 'flex-start' } }
        >
          Log time
        </Button>
      ) }
      { isOpen && <LogTimeDialog subjectId={ subjectId } onClose={ () => setIsOpen( false ) } /> }
    </>
  )
}

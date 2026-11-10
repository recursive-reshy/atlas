// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
// App
import { PastedTextFields } from '../PastedTextFields'

interface PasteSectionProps {
  isOpen: boolean
  disabled: boolean
  text: string
  title: string
  onOpen: () => void
  onClose: () => void
  onTextChange: ( text: string ) => void
  onTitleChange: ( title: string ) => void
}

export function PasteSection( props: PasteSectionProps ): ReactElement {
  const { isOpen, disabled, text, title, onOpen, onClose, onTextChange, onTitleChange } = props

  return (
    <>
      <Button
        variant="text"
        disabled={ disabled }
        onClick={ isOpen ? onClose : onOpen }
        sx={ { alignSelf: 'flex-start' } }
      >
        { isOpen ? 'Don’t paste text' : 'Paste text instead' }
      </Button>
      { isOpen && (
        <PastedTextFields
          text={ text }
          title={ title }
          onTextChange={ onTextChange }
          onTitleChange={ onTitleChange }
          disabled={ disabled }
        />
      ) }
    </>
  )
}

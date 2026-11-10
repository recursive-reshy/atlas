// React
import { useId, useState } from 'react'
import type { ChangeEvent, ReactElement, SyntheticEvent } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
// Shared
import { CreateJobBody, ONLY_YOUTUBE_MESSAGE, detectSourceType } from '@atlas/shared'
import type { SourceType } from '@atlas/shared'
// App
import { SourceTypeSwitch } from '../SourceTypeSwitch'
import { PasteSection } from './PasteSection'
import { SummaryOptions } from '../SummaryOptions'
import type { SummaryOptionsProps } from '../SummaryOptions'

const TEXT = {
  formName: 'Add a video or article',
  inputLabel: 'URL',
  placeholder: 'https://…',
  submitting: 'Starting…',
  invalidUrl: 'Enter a URL starting with http:// or https://',
  invalidText: 'Paste at least 200 characters (and at most 300,000), or remove the pasted text',
} as const

const SUBMIT_LABELS = { video: 'Transcribe', article: 'Summarize' } as const

// As in 0.3.0: a disabled button still takes the pointer and shows not-allowed.
const SUBMIT_SX = {
  alignSelf: 'flex-start',
  '&.Mui-disabled': { pointerEvents: 'auto', cursor: 'not-allowed' },
} as const

interface SubmitFormProps {
  isSubmitting: boolean
  error: string | null
  onSubmit: ( body: CreateJobBody ) => void
  options?: SummaryOptionsProps
}

export function SubmitForm(
  { isSubmitting, error, onSubmit, options }: SubmitFormProps,
): ReactElement {
  const [ url, setUrl ] = useState( '' )
  const [ choice, setChoice ] = useState< SourceType | null >( null )
  const [ isPasting, setIsPasting ] = useState( false )
  const [ text, setText ] = useState( '' )
  const [ title, setTitle ] = useState( '' )
  const [ validationMessage, setValidationMessage ] = useState< string | null >( null )
  const messageId = useId()
  const message = validationMessage ?? error
  const trimmedUrl = url.trim()
  const detected = trimmedUrl === '' ? null : detectSourceType( trimmedUrl )
  const type = choice ?? detected ?? 'video'

  const closePaste = (): void => {
    setIsPasting( false )
    setText( '' )
    setTitle( '' )
  }

  const handleUrlChange = ( event: ChangeEvent< HTMLInputElement > ): void => {
    setUrl( event.target.value )
    setValidationMessage( null )

    if( event.target.value.trim() === '' ) {
      setChoice( null )
      closePaste()
    }
  }

  const handleTypeChange = ( next: SourceType ): void => {
    setChoice( next )

    if( next === 'video' ) {
      closePaste()
    }
  }

  const handleSubmit = ( event: SyntheticEvent< HTMLFormElement > ): void => {
    event.preventDefault()

    const body: CreateJobBody = { url: trimmedUrl }

    if( choice !== null && choice !== detected ) {
      body.source_type = choice
    }

    if( isPasting ) {
      body.text = text
      body.title = title.trim() === '' ? undefined : title
    }

    const parsed = CreateJobBody.safeParse( body )

    if( !parsed.success ) {
      const isUrl = parsed.error.issues.some( ( { path } ) => path[ 0 ] === 'url' )
      const isNotYouTube = parsed.error.issues
        .some( ( { message } ) => message === ONLY_YOUTUBE_MESSAGE )

      if( isNotYouTube ) {
        setValidationMessage( ONLY_YOUTUBE_MESSAGE )
        return
      }

      setValidationMessage( isUrl || !isPasting ? TEXT.invalidUrl : TEXT.invalidText )
      return
    }

    onSubmit( parsed.data )
  }

  return (
    <Box
      component="form"
      aria-label={ TEXT.formName }
      noValidate
      onSubmit={ handleSubmit }
      sx={ { display: 'flex', flexDirection: 'column', gap: 1, width: '100%' } }
    >
      <TextField
        label={ TEXT.inputLabel }
        type="url"
        value={ url }
        placeholder={ TEXT.placeholder }
        autoComplete="off"
        fullWidth
        disabled={ isSubmitting }
        error={ validationMessage !== null }
        onChange={ handleUrlChange }
        slotProps={ {
          htmlInput: { 'aria-describedby': message ? messageId : undefined },
          inputLabel: { shrink: true },
        } }
      />
      { detected !== null && (
        <SourceTypeSwitch value={ type } onChange={ handleTypeChange } disabled={ isSubmitting } />
      ) }
      { detected !== null && type === 'article' && (
        <PasteSection
          isOpen={ isPasting }
          disabled={ isSubmitting }
          text={ text }
          title={ title }
          onOpen={ () => setIsPasting( true ) }
          onClose={ closePaste }
          onTextChange={ setText }
          onTitleChange={ setTitle }
        />
      ) }
      { options !== undefined && <SummaryOptions { ...options } /> }
      <Button type="submit" variant="contained" disabled={ isSubmitting } sx={ SUBMIT_SX }>
        { isSubmitting ? TEXT.submitting : SUBMIT_LABELS[ type ] }
      </Button>
      { message && <Alert severity="error" id={ messageId }>{ message }</Alert> }
    </Box>
  )
}

// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { Job, SubmitPastedTextBody } from '@atlas/shared'
// App
import { PasteTextDialog } from '../PasteTextDialog'

const VIDEO_STAGES = [
  { status: 'queued', label: 'Waiting to start' },
  { status: 'downloading', label: 'Downloading audio' },
  { status: 'converting', label: 'Converting audio' },
  { status: 'transcribing', label: 'Transcribing' },
  { status: 'summarizing', label: 'Summarizing' },
] as const

const ARTICLE_STAGES = [
  { status: 'queued', label: 'Waiting to start' },
  { status: 'fetching', label: 'Fetching the article' },
  { status: 'summarizing', label: 'Summarizing' },
] as const

const LINKING_STAGE = { status: 'linking', label: 'Linking' } as const

const READY_STAGE = { status: 'ready_for_review', label: 'Ready for review' } as const

const LINKED_STATES: Job[ 'link_state' ][] = [ 'pending', 'linked', 'failed' ]

const STATUS_MESSAGES = {
  queued: 'Waiting in the queue…',
  fetching: 'Fetching the article…',
  downloading: 'Downloading audio…',
  converting: 'Converting audio…',
  transcribing: 'Transcribing…',
  summarizing: 'Summarizing…',
  linking: 'Linking…',
  ready_for_review: 'Ready for review',
  summary_failed: 'Summary failed',
  saved: 'Saved',
} as const

const FAILED_MESSAGE = 'Transcription failed.'

type StageState = 'complete' | 'current' | 'pending'

const STAGE_ICONS = {
  complete: <CheckCircleIcon color="success" fontSize="small" />,
  current: <RadioButtonCheckedIcon color="primary" fontSize="small" />,
  pending: <RadioButtonUncheckedIcon color="disabled" fontSize="small" />,
} as const satisfies Record< StageState, ReactElement >

const stageState = ( index: number, currentIndex: number ): StageState => {
  if( index === currentIndex ) {
    return 'current'
  }

  return index < currentIndex ? 'complete' : 'pending'
}

const SECTION_SX = { width: '100%', alignItems: 'flex-start' } as const

const URL_SX = { overflowWrap: 'anywhere' } as const

interface JobProgressProps {
  job: Job
  connectionError: string | null
  onRetry: () => void
  onPasteText?: ( body: SubmitPastedTextBody ) => void
  isPasting?: boolean
  pasteError?: string | null
}

export function JobProgress( props: JobProgressProps ): ReactElement {
  const { job, connectionError, onRetry, onPasteText } = props
  const { isPasting = false, pasteError = null } = props
  const [ isDialogOpen, setIsDialogOpen ] = useState( false )
  const hasLinking = job.status === 'linking' || LINKED_STATES.includes( job.link_state )
  const stages = [
    ...( job.source_type === 'article' ? ARTICLE_STAGES : VIDEO_STAGES ),
    ...( hasLinking ? [ LINKING_STAGE ] : [] ),
    READY_STAGE,
  ]

  if( job.status === 'failed' ) {
    const canPaste = job.source_type === 'article' && onPasteText !== undefined

    return (
      <Stack component="section" aria-label="Job progress" spacing={ 2 } sx={ SECTION_SX }>
        <Typography variant="body2" color="text.secondary" sx={ URL_SX }>{ job.url }</Typography>
        <Alert severity="error">{ job.error ?? FAILED_MESSAGE }</Alert>
        <Stack direction="row" spacing={ 1 }>
          { canPaste && (
            <Button variant="contained" onClick={ () => setIsDialogOpen( true ) }>
              Paste text
            </Button>
          ) }
          <Button variant={ canPaste ? 'outlined' : 'contained' } onClick={ onRetry }>
            Try again
          </Button>
        </Stack>
        { canPaste && isDialogOpen && (
          <PasteTextDialog
            isSubmitting={ isPasting }
            error={ pasteError }
            onSubmit={ onPasteText }
            onCancel={ () => setIsDialogOpen( false ) }
          />
        ) }
      </Stack>
    )
  }

  const currentIndex = stages.findIndex( ( { status } ) => status === job.status )

  return (
    <Stack component="section" aria-label="Job progress" spacing={ 2 } sx={ SECTION_SX }>
      <Typography variant="body2" color="text.secondary" sx={ URL_SX }>{ job.url }</Typography>
      { connectionError && (
        <Alert severity="error">{ `${ connectionError }. Retrying…` }</Alert>
      ) }
      <Typography role="status" sx={ { fontWeight: 600 } }>
        { STATUS_MESSAGES[ job.status ] }
      </Typography>
      <List component="ol" disablePadding>
        { stages.map( ( { status, label }, index ) => {
          const isCurrent = index === currentIndex
          const state = job.status === 'ready_for_review'
            ? 'complete'
            : stageState( index, currentIndex )

          return (
            <ListItem
              key={ status }
              disableGutters
              aria-current={ isCurrent ? 'step' : undefined }
              data-state={ state }
            >
              <ListItemIcon sx={ { minWidth: 32 } }>{ STAGE_ICONS[ state ] }</ListItemIcon>
              <ListItemText
                primary={ label }
                slotProps={ { primary: { sx: { fontWeight: isCurrent ? 700 : 400 } } } }
              />
            </ListItem>
          )
        } ) }
      </List>
    </Stack>
  )
}

// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useParams, useSearchParams } from 'react-router'
// App
import { LogTimeButton } from '#src/components/LogTimeButton'
import { SubjectNotes } from '#src/components/SubjectNotes'
import { SubjectOverview } from '#src/components/SubjectOverview'
import { SubjectSettings } from '#src/components/SubjectSettings'
import { SyllabusPanel } from '#src/components/SyllabusPanel'
import {
  useEnrollSubject,
  useRetryGeneration,
  useSetNoteEnrolled,
  useUpdateSubject,
} from '#src/hooks/useMeleteMutations'
import { useMeleteSubject } from '#src/hooks/useMeleteSubject'
import { useMeleteSyllabus } from '#src/hooks/useMeleteSyllabus'
import { useOffSyllabusAction } from '#src/hooks/useNoteMappingMutations'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'syllabus', label: 'Syllabus' },
  { value: 'notes', label: 'Notes' },
  { value: 'settings', label: 'Settings' },
] as const

type TabValue = typeof TABS[ number ][ 'value' ]

const tabFrom = ( text: string | null ): TabValue => {
  return TABS.find( ( { value } ) => value === text )?.value ?? 'overview'
}

// Without an approved syllabus there is nothing to measure, so the tab points at the syllabus
function Overview(
  { subjectId, isApproved, onSetUp }: {
    subjectId: string
    isApproved: boolean
    onSetUp: () => void
  },
): ReactElement {
  if( isApproved ) {
    return <SubjectOverview subjectId={ subjectId } />
  }

  return (
    <Stack spacing={ 1 } sx={ { alignItems: 'flex-start' } }>
      <Typography>Set up a syllabus to see what this subject should cover.</Typography>
      <Button variant="contained" sx={ { minHeight: 44 } } onClick={ onSetUp }>
        Set up syllabus
      </Button>
    </Stack>
  )
}

export function MeleteSubject(): ReactElement {
  const { subjectId = '' } = useParams()
  const [ params, setParams ] = useSearchParams()
  const { subject, notes, isLoading, error } = useMeleteSubject( subjectId )
  const enrollSubject = useEnrollSubject()
  const updateSubject = useUpdateSubject()
  const setNoteEnrolled = useSetNoteEnrolled()
  const retryGeneration = useRetryGeneration()
  const offSyllabus = useOffSyllabusAction()
  const { syllabus } = useMeleteSyllabus( subjectId, subject?.syllabus_status === 'approved' )
  const changeError = [
    enrollSubject,
    updateSubject,
    setNoteEnrolled,
    retryGeneration,
    offSyllabus,
  ].find( ( mutation ) => mutation.isError )?.error?.message ?? null
  const tab = tabFrom( params.get( 'tab' ) )
  const openTab = ( value: TabValue ): void => setParams( { tab: value } )

  if( isLoading ) {
    return <Typography role="status">Loading subject…</Typography>
  }

  if( subject === null ) {
    return <Alert severity="error">{ error ?? 'Could not load the subject' }</Alert>
  }

  return (
    <Stack spacing={ 2 } sx={ { width: '100%', maxWidth: '40rem' } }>
      <Link component={ RouterLink } to="/melete" underline="hover">Today</Link>
      <Typography variant="h5" component="h2">{ subject.name }</Typography>
      <Typography color="text.secondary">
        { `${ subject.note_count } notes · ${ subject.enrolled_count } enrolled`
          + ` · ${ subject.due_count } due` }
      </Typography>
      <LogTimeButton subjectId={ subject.id } />
      { changeError !== null && <Alert severity="error">{ changeError }</Alert> }
      <Tabs
        value={ tab }
        variant="scrollable"
        aria-label="Subject sections"
        onChange={ ( _event, value: TabValue ) => openTab( value ) }
      >
        { TABS.map( ( { value, label } ) => (
          <Tab key={ value } value={ value } label={ label } />
        ) ) }
      </Tabs>
      { tab === 'overview' && (
        <Overview
          subjectId={ subject.id }
          isApproved={ subject.syllabus_status === 'approved' }
          onSetUp={ () => openTab( 'syllabus' ) }
        />
      ) }
      { tab === 'syllabus' && <SyllabusPanel subject={ subject } /> }
      { tab === 'notes' && (
        <SubjectNotes
          notes={ notes }
          syllabus={ subject.syllabus_status === 'approved' ? syllabus : null }
          onEnrolledChange={ ( id, enrolled ) => setNoteEnrolled.mutate( { id, enrolled } ) }
          onRetry={ ( id ) => retryGeneration.mutate( id ) }
          onDismissOffSyllabus={ ( id ) => {
            offSyllabus.mutate( { id, body: { action: 'dismiss' } } )
          } }
          onAddOffSyllabus={ ( id, sectionId ) => {
            offSyllabus.mutate( { id, body: { action: 'add_concept', section_id: sectionId } } )
          } }
        />
      ) }
      { tab === 'settings' && (
        <SubjectSettings
          subject={ subject }
          onEnrollAll={ ( enrolled ) => enrollSubject.mutate( { id: subject.id, enrolled } ) }
          onUpdate={ ( body ) => updateSubject.mutate( { id: subject.id, body } ) }
        />
      ) }
    </Stack>
  )
}

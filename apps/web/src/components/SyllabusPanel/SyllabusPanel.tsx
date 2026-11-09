// React
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import LinearProgress from '@mui/material/LinearProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { MeleteSubject, MeleteTargetLevel } from '@atlas/shared'
// App
import { SyllabusEditor } from '#src/components/SyllabusEditor'
import { SyllabusSetup } from '#src/components/SyllabusSetup'
import { useUpdateSubject } from '#src/hooks/useMeleteMutations'
import { useMeleteSyllabus } from '#src/hooks/useMeleteSyllabus'
import {
  useApproveSyllabus,
  useDraftSyllabus,
  useSaveSyllabus,
} from '#src/hooks/useSyllabusMutations'

interface SyllabusPanelProps {
  subject: MeleteSubject
}

export function SyllabusPanel( { subject }: SyllabusPanelProps ): ReactElement {
  const status = subject.syllabus_status
  const hasSyllabus = status === 'draft' || status === 'approved'
  const { syllabus, isLoading, error } = useMeleteSyllabus( subject.id, hasSyllabus )
  const updateSubject = useUpdateSubject()
  const draftSyllabus = useDraftSyllabus()
  const approveSyllabus = useApproveSyllabus()
  const saveSyllabus = useSaveSyllabus()
  const failure = [ updateSubject, draftSyllabus, approveSyllabus, saveSyllabus ]
    .find( ( mutation ) => mutation.isError )?.error?.message ?? null

  const handleDraft = async (
    setup: { target_level: MeleteTargetLevel, intent: string | null },
  ): Promise< void > => {
    try {
      if( setup.target_level !== subject.target_level || setup.intent !== subject.intent ) {
        await updateSubject.mutateAsync( { id: subject.id, body: setup } )
      }

      draftSyllabus.mutate( subject.id )
    } catch{
      // The failed update shows its own message below, and no draft is asked for
    }
  }

  return (
    <Stack spacing={ 2 }>
      { failure !== null && <Alert severity="error">{ failure }</Alert> }
      { ( status === 'none' || status === 'failed' ) && (
        <SyllabusSetup
          subject={ subject }
          isBusy={ updateSubject.isPending || draftSyllabus.isPending }
          onDraft={ ( setup ) => void handleDraft( setup ) }
        />
      ) }
      { status === 'drafting' && (
        <Stack spacing={ 1 } role="status">
          <Typography>Drafting the syllabus. This takes a minute or so.</Typography>
          <LinearProgress />
        </Stack>
      ) }
      { hasSyllabus && isLoading && (
        <Typography role="status">Loading the syllabus…</Typography>
      ) }
      { hasSyllabus && error !== null && (
        <Alert severity="error">{ error }</Alert>
      ) }
      { hasSyllabus && syllabus !== null && (
        <SyllabusEditor
          key={ JSON.stringify( syllabus ) }
          syllabus={ syllabus }
          status={ status }
          isBusy={ saveSyllabus.isPending || approveSyllabus.isPending || draftSyllabus.isPending }
          savedDiff={ saveSyllabus.data?.diff ?? null }
          onSave={ ( edit ) => saveSyllabus.mutate( { id: subject.id, edit } ) }
          onApprove={ () => approveSyllabus.mutate( subject.id ) }
          onRedraft={ () => draftSyllabus.mutate( subject.id ) }
        />
      ) }
    </Stack>
  )
}

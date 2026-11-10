// React
import type { ReactElement } from 'react'
// Packages
import Typography from '@mui/material/Typography'
// Shared
import type { PromptPurpose } from '@atlas/shared'
// App
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { LockedInstructions } from '../LockedInstructions'

const OWN_TITLES = {
  melete_questions: 'Instructions the app always sends for question generation',
  melete_grading: 'Instructions the app always sends for grading',
  melete_map: 'Instructions the app always sends for mapping notes',
  melete_suggest: 'Instructions the app always sends for resource suggestions',
} as const

const SYLLABUS_TITLE = 'Instructions the app always sends for syllabus drafting'
const LINKER_TITLE = 'Instructions the app always sends when linking'

interface PromptLockedInstructionsProps {
  purpose: PromptPurpose
}

// The text a prompt's guidance is added to. The linker's and the syllabus's come from the agent
// service, so they can be missing while it is down.
export function PromptLockedInstructions(
  { purpose }: PromptLockedInstructionsProps,
): ReactElement | null {
  const { lockedInstructions, linkerLockedInstructions, syllabusLockedInstructions } = useSettings()

  if( purpose === 'linker' || purpose === 'melete_syllabus' ) {
    const isLinker = purpose === 'linker'
    const text = isLinker ? linkerLockedInstructions : syllabusLockedInstructions

    return text === null
      ? (
        <Typography variant="body2" color="text.secondary">
          Unavailable while the agent service is down.
        </Typography>
      )
      : <LockedInstructions title={ isLinker ? LINKER_TITLE : SYLLABUS_TITLE } text={ text } />
  }

  if( lockedInstructions === null ) {
    return null
  }

  if( purpose === 'summary' ) {
    return (
      <>
        <LockedInstructions
          title="Instructions the app always sends for videos"
          text={ lockedInstructions.video }
        />
        <LockedInstructions
          title="Instructions the app always sends for articles"
          text={ lockedInstructions.article }
        />
      </>
    )
  }

  return (
    <LockedInstructions title={ OWN_TITLES[ purpose ] } text={ lockedInstructions[ purpose ] } />
  )
}

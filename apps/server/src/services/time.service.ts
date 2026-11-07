// Time
import { studyDay } from '../themis/periods.js'
import { nextSession } from '../time/session.js'
// Repositories
import {
  extendMeasuredEntry,
  insertMeasuredEntry,
  latestMeasuredEntry,
} from '../repositories/timeEntries.repository.js'
// Services
import { getFinalCardSeconds, getSessionGapMinutes } from './settings.service.js'

// Called with each saved answer, inside the answer's own transaction: it extends the subject's
// open session or starts one (ADR 0091). It uses the shared connection, so it joins that
// transaction and is undone with it.
export const recordAnswerTime = ( userId: string, subjectId: string, at: Date ): void => {
  const step = nextSession( latestMeasuredEntry( userId, subjectId ), at, {
    gapMinutes: getSessionGapMinutes( userId ),
    finalCardSeconds: getFinalCardSeconds( userId ),
    dayOf: studyDay,
  } )

  if( step.kind === 'extend' ) {
    extendMeasuredEntry( userId, step.id, step )

    return
  }

  insertMeasuredEntry( userId, subjectId, step )
}

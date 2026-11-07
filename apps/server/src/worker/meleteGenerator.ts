// Services
import { generateForNote } from '../services/meleteGeneration.service.js'
import { draftForSubject } from '../services/meleteSyllabus.service.js'
// Repositories
import {
  claimNextDraft,
  claimNextGeneration,
  requeueGenerating,
} from '../repositories/system.repository.js'
// Logging
import { logger } from '../logger.js'
import { withLogContext } from '../logContext.js'

const POLL_INTERVAL_MS = 1000

// Drafts syllabi and makes questions for queued notes, one at a time, beside the job worker
// (ADRs 0058, 0089). Drafts go first: someone asked for one and is waiting on the page.
export const startMeleteGenerator = (): ( () => Promise< void > ) => {
  let busy = false
  let stopped = false
  let currentPass: Promise< void > | undefined

  // A note left generating by a restart would otherwise never be picked up
  const requeued = requeueGenerating()

  if( requeued > 0 ) {
    logger.info( { requeued }, 'Requeued Melete notes interrupted by a restart' )
  }

  const runPass = async (): Promise< void > => {
    // A subject stays `drafting` until its draft finishes, so a pass tries each one once
    const triedDrafts: string[] = []

    try {
      // Claiming marks the note generating, so never claim one that won't be run
      while( !stopped ) {
        const subject = claimNextDraft( new Date().toISOString(), triedDrafts )

        if( subject !== undefined ) {
          triedDrafts.push( subject.id )

          await withLogContext(
            { melete_subject_id: subject.id, user_id: subject.user_id },
            () => draftForSubject( subject.user_id, subject.id ),
          )

          continue
        }

        const note = claimNextGeneration( new Date().toISOString() )

        if( note === undefined ) {
          break
        }

        const { id, user_id: userId } = note

        await withLogContext(
          { melete_note_id: id, user_id: userId },
          () => generateForNote( userId, id ),
        )
      }
    } catch( error ) {
      logger.error( { err: error }, 'Melete generator pass failed' )
    }
  }

  const startPass = (): void => {
    if( busy || stopped ) {
      return
    }

    busy = true
    currentPass = runPass().finally( () => {
      busy = false
    } )
  }

  startPass()
  const timer = setInterval( startPass, POLL_INTERVAL_MS )

  return async () => {
    clearInterval( timer )
    stopped = true

    await currentPass
  }
}

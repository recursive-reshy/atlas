// Services
import { generateForNote } from '../services/meleteGeneration.service.js'
import { mapForNote } from '../services/meleteMapping.service.js'
import { draftForSubject } from '../services/meleteSyllabus.service.js'
// Repositories
import {
  claimNextDraft,
  claimNextGeneration,
  claimNextMapping,
  requeueGenerating,
  requeueMapping,
} from '../repositories/system.repository.js'
// Worker
import { onGeneratorWake } from './wake.js'
// Logging
import { logger } from '../logger.js'
import { withLogContext } from '../logContext.js'

// Safety net: a pass also runs on every wake (ADR 0100)
const POLL_INTERVAL_MS = 15_000

// Drafts syllabi, makes questions for queued notes and maps notes onto an approved syllabus, one
// at a time, beside the job worker (ADRs 0058, 0089). Drafts go first, someone is waiting on the
// page for one; mapping goes last, because Generate maps the notes it makes questions for.
export const startMeleteGenerator = (): ( () => Promise< void > ) => {
  let busy = false
  let stopped = false
  let currentPass: Promise< void > | undefined

  // A note left generating by a restart would otherwise never be picked up
  const requeued = requeueGenerating()

  if( requeued > 0 ) {
    logger.info( { requeued }, 'Requeued Melete notes interrupted by a restart' )
  }

  const requeuedMapping = requeueMapping()

  if( requeuedMapping > 0 ) {
    logger.info(
      { requeued: requeuedMapping },
      'Requeued Melete mappings interrupted by a restart',
    )
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

        if( note !== undefined ) {
          const { id, user_id: userId } = note

          await withLogContext(
            { melete_note_id: id, user_id: userId },
            () => generateForNote( userId, id ),
          )

          continue
        }

        const mapping = claimNextMapping( new Date().toISOString() )

        if( mapping === undefined ) {
          break
        }

        await withLogContext(
          { melete_note_id: mapping.id, user_id: mapping.user_id },
          () => mapForNote( mapping.user_id, mapping.id ),
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
  const unsubscribe = onGeneratorWake( startPass )

  return async () => {
    clearInterval( timer )
    unsubscribe()
    stopped = true

    await currentPass
  }
}

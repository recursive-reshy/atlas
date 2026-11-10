// Services
import { claimNextJob } from '../services/jobs.service.js'
// Worker
import { runJob } from './runJob.js'
import { onWorkerWake } from './wake.js'
// Logging
import { logger } from '../logger.js'
import { withLogContext } from '../logContext.js'

// Safety net: a pass also runs on every wake (ADR 0100)
const POLL_INTERVAL_MS = 15_000

export const startWorker = (): ( () => Promise< void > ) => {
  let busy = false
  let stopped = false
  let pending = false
  let currentPass: Promise< void > | undefined

  const runPass = async (): Promise< void > => {
    try {
      let next = claimNextJob()

      while( next !== undefined && !stopped ) {
        const { job: { id }, userId } = next

        await withLogContext( { job_id: id, user_id: userId }, () => runJob( userId, id ) )
        next = claimNextJob()
      }
    } catch( error ) {
      logger.error( { err: error }, 'Worker pass failed' )
    }
  }

  const startPass = (): void => {
    if( stopped ) {
      return
    }

    // A wake during a pass means work arrived after the pass last looked: run one more
    if( busy ) {
      pending = true

      return
    }

    busy = true
    currentPass = runPass().finally( () => {
      busy = false

      if( pending ) {
        pending = false
        startPass()
      }
    } )
  }

  startPass()
  const timer = setInterval( startPass, POLL_INTERVAL_MS )
  const unsubscribe = onWorkerWake( startPass )

  return async () => {
    clearInterval( timer )
    unsubscribe()
    stopped = true

    await currentPass
  }
}

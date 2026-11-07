// Node
import { AsyncLocalStorage } from 'node:async_hooks'

export type LogContext = {
  user_id?: string
  job_id?: string
  feed_id?: string
  gmail_source_id?: string
  melete_note_id?: string
  melete_subject_id?: string
}

const storage = new AsyncLocalStorage< LogContext >()

export const getLogContext = (): LogContext | undefined => storage.getStore()

// Every log line written while fn runs (however deep, across awaits) carries the context
export const withLogContext = < T >( context: LogContext, fn: () => T ): T => {
  return storage.run( { ...storage.getStore(), ...context }, fn )
}

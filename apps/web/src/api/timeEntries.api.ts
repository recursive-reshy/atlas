// Shared
import { TimeEntryResponse } from '@atlas/shared'
import type { LogTimeBody, TimeEntry } from '@atlas/shared'
// App
import { request } from './request'

// Minutes the person spent on a subject or a goal, on a day (ADR 0091)
export const logTime = async ( body: LogTimeBody ): Promise< TimeEntry > => {
  const { entry } = await request( '/api/time-entries', TimeEntryResponse, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  } )

  return entry
}

// Shared
import type { Backfill, GmailDestination } from '@atlas/shared'

const BACKFILL_CAP = 200

export const intakeLine = ( destination: GmailDestination, backfill: Backfill ): string => {
  if( destination === 'jobs' ) {
    return 'Emails already in your mailbox are marked as seen. '
      + 'Collection starts with the next new email.'
  }

  if( backfill === 'none' ) {
    return 'Only the newest email will go to your inbox.'
  }

  if( backfill === 'all' ) {
    return `Up to the newest ${ BACKFILL_CAP } emails will go to your inbox.`
  }

  return `Emails from the last ${ backfill === '30d' ? 30 : 90 } days `
    + `(up to ${ BACKFILL_CAP }) will go to your inbox.`
}

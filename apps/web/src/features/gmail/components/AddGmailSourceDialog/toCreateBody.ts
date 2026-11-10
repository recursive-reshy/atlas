// Shared
import type {
  Backfill,
  CreateGmailSourceBody,
  GmailDestination,
  GmailMatch,
} from '@atlas/shared'

interface NewsletterChoices {
  profileId: string
  autoSummarize: boolean
  backfill: Backfill
}

// The newsletter choices are sent only for a newsletter. An empty profile id is the default.
export const toCreateBody = (
  { name, match, destination }: { name: string, match: GmailMatch, destination: GmailDestination },
  { profileId, autoSummarize, backfill }: NewsletterChoices,
): CreateGmailSourceBody => {
  const body: CreateGmailSourceBody = { name, match, destination }

  if( destination === 'newsletter' ) {
    if( profileId !== '' ) {
      body.profile_id = profileId
    }

    if( autoSummarize ) {
      body.auto_summarize = true
    }

    body.backfill = backfill
  }

  return body
}

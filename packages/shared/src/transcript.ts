// Packages
import { z } from 'zod'

export const TranscriptMeta = z.object( {
  title: z.string().min( 1 ),
  source: z.url(),
  channel: z.string(),
  duration_seconds: z.number().int().min( 0 ),
  transcribed_at: z.iso.datetime(),
  model: z.string().min( 1 ),
} )
export type TranscriptMeta = z.infer< typeof TranscriptMeta >

// Packages
import { z } from 'zod'

export const TranscriptMeta = z.object( {
  title: z.string().min( 1 ),
  source: z.url(),
  channel: z.string(),
  duration_seconds: z.number().int().min( 0 ),
  transcribed_at: z.iso.datetime(),
  model: z.string().min( 1 ),
  // Gemini stopped at its output limit; the transcript is the part it wrote (ADR 0081)
  truncated: z.boolean().optional(),
} )
export type TranscriptMeta = z.infer< typeof TranscriptMeta >

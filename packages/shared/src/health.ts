// Packages
import { z } from 'zod'

// What GET /api/health answers (ADR 0086). Replication comes from the stored Litestream check;
// `configured: false` (other fields null) is the Mac, where no Litestream runs.
export const HealthReplication = z.object( {
  configured: z.boolean(),
  failing: z.boolean().nullable(),
  last_success_at: z.iso.datetime().nullable(),
  last_checked_at: z.iso.datetime().nullable(),
} )
export type HealthReplication = z.infer< typeof HealthReplication >

export const HealthResponse = z.object( {
  ok: z.boolean(),
  version: z.string(),
  schema: z.number().int(),
  replication: HealthReplication,
} )
export type HealthResponse = z.infer< typeof HealthResponse >

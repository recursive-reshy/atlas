// Packages
import { z } from 'zod'
// Shared
import type { HealthResponse } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { getHealth } from '../repositories/health.repository.js'
import { appVersion } from '../version.js'

// The body of GET /api/health (ADR 0086): the app is up, which version and schema it runs, and the
// last stored Litestream check. Read-only and cheap, because deploy.sh polls it.
export const getHealthReport = (): HealthResponse => {
  const schema = z.number().parse( getDatabase().pragma( 'user_version', { simple: true } ) )
  const row = config.litestreamMetricsUrl === null
    ? undefined
    : getHealth( null, 'replication', 'default' )

  return {
    ok: true,
    version: appVersion,
    schema,
    replication: config.litestreamMetricsUrl === null
      ? { configured: false, failing: null, last_success_at: null, last_checked_at: null }
      : {
        configured: true,
        failing: row?.failing_since != null,
        last_success_at: row?.last_success_at ?? null,
        last_checked_at: row?.last_checked_at ?? null,
      },
  }
}

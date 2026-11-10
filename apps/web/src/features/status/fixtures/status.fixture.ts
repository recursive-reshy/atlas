// Shared
import type { GetStatusResponse, StatusRow } from '@atlas/shared'

export const statusRowFixture = ( overrides: Partial< StatusRow > = {} ): StatusRow => {
  return {
    kind: 'agent',
    id: 'default',
    name: 'Agent service',
    state: 'ok',
    last_checked_at: '2026-10-22T10:00:00.000Z',
    last_success_at: '2026-10-22T10:00:00.000Z',
    last_error: null,
    failing_since: null,
    detail: null,
    ...overrides,
  }
}

export const failingRowFixture = ( overrides: Partial< StatusRow > = {} ): StatusRow => {
  return statusRowFixture( {
    state: 'failing',
    last_success_at: '2026-10-22T09:00:00.000Z',
    last_error: 'Could not reach the agent',
    failing_since: '2026-10-22T10:00:00.000Z',
    ...overrides,
  } )
}

export const statusFixture = (
  rows: StatusRow[] = [ statusRowFixture() ],
): GetStatusResponse => {
  return { rows, failing_count: rows.filter( ( { state } ) => state === 'failing' ).length }
}

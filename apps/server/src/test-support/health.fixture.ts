// Shared
import type { HealthKind } from '@atlas/shared'
// Repositories
import { recordFailure, recordSuccess } from '../repositories/health.repository.js'

// Gives a feed or Gmail source of the user the check data its row used to carry before migration 8.
export const seedCheck = (
  userId: string,
  kind: HealthKind,
  id: string,
  checkedAt: string | null,
  error: string | null,
): void => {
  if( checkedAt === null ) {
    return
  }

  if( error === null ) {
    recordSuccess( userId, kind, id, checkedAt )
  } else {
    recordFailure( userId, kind, id, checkedAt, error )
  }
}

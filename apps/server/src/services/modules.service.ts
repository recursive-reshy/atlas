// Shared
import { ModuleId } from '@atlas/shared'
// Repositories
import { listModules } from '../repositories/userModules.repository.js'
import { findUserById } from '../repositories/users.repository.js'

// The admin always has every module; a member has the ones the admin switched on (ADR 0067)
export const modulesFor = ( userId: string ): ModuleId[] => {
  const user = findUserById( userId )

  if( user === undefined ) {
    return []
  }

  return user.role === 'admin' ? [ ...ModuleId.options ] : listModules( userId )
}

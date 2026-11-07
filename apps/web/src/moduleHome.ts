// Shared
import type { ModuleId } from '@atlas/shared'

// In drawer order: the first one a user has is where they land.
const MODULE_HOMES: Record< ModuleId, string > = {
  transcriber: '/',
  melete: '/melete',
  themis: '/themis',
}

export const homeFor = ( modules: ModuleId[] ): string => {
  const first = ( Object.keys( MODULE_HOMES ) as ModuleId[] )
    .find( ( module ) => modules.includes( module ) )

  return first === undefined ? '/' : MODULE_HOMES[ first ]
}

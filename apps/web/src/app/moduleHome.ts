// Shared
import type { ModuleId } from '@atlas/shared'

// In drawer order: the first one a user has is where they land. Themis lands on Home, which is
// made of cards from the modules (ADR 0109).
const MODULE_HOMES: Record< ModuleId, string > = {
  themis: '/',
  transcriber: '/transcriber',
  melete: '/melete',
}

export const homeFor = ( modules: ModuleId[] ): string => {
  const first = ( Object.keys( MODULE_HOMES ) as ModuleId[] )
    .find( ( module ) => modules.includes( module ) )

  return first === undefined ? '/' : MODULE_HOMES[ first ]
}

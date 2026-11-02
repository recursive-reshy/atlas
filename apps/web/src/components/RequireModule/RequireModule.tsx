// React
import type { ReactElement } from 'react'
// Packages
import { Navigate, Outlet } from 'react-router'
// Shared
import type { ModuleId } from '@atlas/shared'
// App
import { useMe } from '#src/hooks/useMe'
import { homeFor } from '#src/moduleHome'

type RequireModuleProps = {
  module: ModuleId
}

// A layout route for a module's pages. The server refuses these routes too (ADR 0068).
export function RequireModule( { module }: RequireModuleProps ): ReactElement {
  const { me } = useMe()

  if( me === null || me.modules.includes( module ) ) {
    return <Outlet />
  }

  return <Navigate to={ homeFor( me.modules ) } replace />
}

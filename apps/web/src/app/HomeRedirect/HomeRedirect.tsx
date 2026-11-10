// React
import type { ReactElement } from 'react'
// Packages
import { Navigate } from 'react-router'
// App
import { useMe } from '../useMe'
import { homeFor } from '../moduleHome'

export function HomeRedirect(): ReactElement {
  const { me } = useMe()

  return <Navigate to={ homeFor( me?.modules ?? [] ) } replace />
}

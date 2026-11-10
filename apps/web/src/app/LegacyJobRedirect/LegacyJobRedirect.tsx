// React
import type { ReactElement } from 'react'
// Packages
import { Navigate, useParams } from 'react-router'

// /jobs/:id was the job page before the transcriber moved under /transcriber (ADR 0109)
export function LegacyJobRedirect(): ReactElement {
  const { id } = useParams()

  return <Navigate to={ `/transcriber/jobs/${ id ?? '' }` } replace />
}

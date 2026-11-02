// Shared
import { GetHealthErrorsResponse, GetStatusResponse } from '@atlas/shared'
import type { HealthError, HealthKind } from '@atlas/shared'
// App
import { request } from './request'

export const getStatus = async (): Promise< GetStatusResponse > => {
  return request( '/api/status', GetStatusResponse )
}

export const refreshStatus = async (): Promise< GetStatusResponse > => {
  return request( '/api/status/refresh', GetStatusResponse, { method: 'POST' } )
}

export const getHealthErrors = async ( kind: HealthKind, id: string ): Promise< HealthError[] > => {
  const { errors } = await request(
    `/api/status/${ kind }/${ encodeURIComponent( id ) }/errors`,
    GetHealthErrorsResponse,
  )

  return errors
}

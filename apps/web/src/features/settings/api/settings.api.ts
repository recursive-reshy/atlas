// Shared
import { GetSettingsResponse } from '@atlas/shared'
import type { UpdateSettingsBody } from '@atlas/shared'
// App
import { request } from '#src/lib/request'

export const getSettings = async (): Promise< GetSettingsResponse > => {
  return request( '/api/settings', GetSettingsResponse )
}

export const updateSettings = async (
  body: UpdateSettingsBody,
): Promise< GetSettingsResponse > => {
  return request( '/api/settings', GetSettingsResponse, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  } )
}

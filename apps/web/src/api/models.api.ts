// Shared
import { ListModelsResponse } from '@atlas/shared'
// App
import { request } from '../lib/request'

export const listModels = async (): Promise< ListModelsResponse > => {
  return request( '/api/models', ListModelsResponse )
}

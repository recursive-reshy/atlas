// Shared
import { ErrorResponse, ListFoldersResponse } from '@atlas/shared'
// App
import { ApiError } from '../lib/apiError'

export const listFolders = async (): Promise< ListFoldersResponse > => {
  let response: Response

  try {
    response = await fetch( '/api/vault/folders', undefined )
  } catch{
    throw new ApiError( 'Could not reach the server', null )
  }

  const body: unknown = await response.json().catch( () => null )

  if( !response.ok ) {
    const parsedError = ErrorResponse.safeParse( body )

    throw new ApiError(
      parsedError.success
        ? parsedError.data.error
        : `Request failed with status ${ response.status }`,
      response.status,
    )
  }

  const parsed = ListFoldersResponse.safeParse( body )

  if( !parsed.success ) {
    throw new ApiError( 'Unexpected response from the server', response.status )
  }

  return parsed.data
}

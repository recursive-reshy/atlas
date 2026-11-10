// Vitest
import { describe, expect, it } from 'vitest'
// App
import { ApiError } from './apiError'

describe( 'ApiError', () => {
  it( 'is an Error carrying a message, a status and its name', () => {
    const error = new ApiError( 'Job not found', 404 )

    expect( error ).toBeInstanceOf( Error )
    expect( error ).toBeInstanceOf( ApiError )
    expect( error.message ).toBe( 'Job not found' )
    expect( error.status ).toBe( 404 )
    expect( error.name ).toBe( 'ApiError' )
  } )
} )

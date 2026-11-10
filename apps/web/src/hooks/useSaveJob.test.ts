// Testing Library
import { act } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ApiError } from '../lib/apiError'
import { saveJob } from '../api/jobs.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { useSaveJob } from './useSaveJob'

vi.mock( '../api/jobs.api' )

const mockedSaveJob = vi.mocked( saveJob )
const jobId = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b'

beforeEach( () => {
  mockedSaveJob.mockReset()
} )

describe( 'useSaveJob', () => {
  it( 'flushes the autosave first, then saves and refreshes the jobs', async () => {
    const order: string[] = []
    const flush = vi.fn( () => {
      order.push( 'flush' )

      return Promise.resolve( true )
    } )
    mockedSaveJob.mockImplementation( () => {
      order.push( 'save' )

      return Promise.resolve( 'Mnemosyne/A talk.md' )
    } )
    const { result, queryClient } = renderHookWithClient( () => useSaveJob( jobId, flush ) )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    act( () => result.current.mutate() )

    await vi.waitFor( () => expect( result.current.data ).toBe( 'Mnemosyne/A talk.md' ) )
    expect( order ).toEqual( [ 'flush', 'save' ] )
    expect( mockedSaveJob ).toHaveBeenCalledExactlyOnceWith( jobId )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: [ 'jobs' ] } )
  } )

  it( 'does not save when the flush fails, and says so', async () => {
    const flush = vi.fn( () => Promise.resolve( false ) )
    const { result } = renderHookWithClient( () => useSaveJob( jobId, flush ) )

    act( () => result.current.mutate() )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message )
      .toBe( 'Your latest edits could not be saved, so the note was not written to the vault.' )
    expect( mockedSaveJob ).not.toHaveBeenCalled()
  } )

  it( 'reports the server message when saving fails', async () => {
    mockedSaveJob.mockRejectedValue( new ApiError( 'Cannot move job from saved to saved', 409 ) )
    const { result } = renderHookWithClient(
      () => useSaveJob( jobId, () => Promise.resolve( true ) ),
    )

    act( () => result.current.mutate() )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Cannot move job from saved to saved' )
  } )
} )

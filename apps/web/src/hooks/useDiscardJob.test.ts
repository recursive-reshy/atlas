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
// Shared
import type { Job } from '@atlas/shared'
// App
import { ApiError } from '../api/apiError'
import { discardJob } from '../api/jobs.api'
import { jobFixture } from '../test-support/job.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { jobKeys } from './queryKeys'
import { useDiscardJob } from './useDiscardJob'

vi.mock( '../api/jobs.api' )

const mockedDiscardJob = vi.mocked( discardJob )
const first = jobFixture( { status: 'ready_for_review' } )
const second = jobFixture( {
  id: '9b1f6a2e-0c7d-4f3a-8b5e-2d4c6e8f0a1b',
  status: 'summary_failed',
} )

const setup = () => {
  const rendered = renderHookWithClient( () => useDiscardJob( first.id ) )
  rendered.queryClient.setQueryData( jobKeys.all, [ first, second ] )

  return rendered
}

beforeEach( () => {
  mockedDiscardJob.mockReset()
  window.localStorage.clear()
} )

describe( 'useDiscardJob', () => {
  it( 'removes the job from the list at once, before the server answers', async () => {
    mockedDiscardJob.mockReturnValue( new Promise< void >( () => undefined ) )
    const { result, queryClient } = setup()

    act( () => result.current.mutate() )

    await vi.waitFor( () => {
      expect( queryClient.getQueryData< Job[] >( jobKeys.all ) ).toEqual( [ second ] )
    } )
    expect( mockedDiscardJob ).toHaveBeenCalledWith( first.id )
  } )

  it( 'restores the list and reports the error when the server refuses', async () => {
    mockedDiscardJob.mockRejectedValue( new ApiError( 'Cannot discard a job that is saved', 409 ) )
    const { result, queryClient } = setup()

    act( () => result.current.mutate() )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Cannot discard a job that is saved' )
    expect( queryClient.getQueryData< Job[] >( jobKeys.all ) ).toEqual( [ first, second ] )
  } )

  it( 'forgets the job on success', async () => {
    mockedDiscardJob.mockResolvedValue( undefined )
    const { result, queryClient } = setup()
    queryClient.setQueryData( jobKeys.detail( first.id ), first )

    act( () => result.current.mutate() )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( queryClient.getQueryData( jobKeys.detail( first.id ) ) ).toBeUndefined()
  } )
} )

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
import { ApiError } from '#src/lib/apiError'
import { getSettings, updateSettings } from '../api/settings.api'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { settingsFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { meleteKeys, settingsKeys } from '#src/lib/queryKeys'
import { useSettings } from './useSettings'

vi.mock( '../api/settings.api' )

const mockedGet = vi.mocked( getSettings )
const mockedUpdate = vi.mocked( updateSettings )

beforeEach( () => {
  mockedGet.mockReset()
  mockedUpdate.mockReset()
} )

describe( 'useSettings', () => {
  it( 'starts loading, then returns the settings and the locked instructions', async () => {
    mockedGet.mockResolvedValue( settingsFixture() )
    const { result } = renderHookWithClient( () => useSettings() )

    expect( result.current ).toMatchObject( {
      settings: null,
      lockedInstructions: null,
      isLoading: true,
      error: null,
    } )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current ).toMatchObject( {
      settings: settingsFixture().settings,
      lockedInstructions: settingsFixture().locked_instructions,
      error: null,
    } )
  } )

  it( 'returns the agent status and the linker locked instructions', async () => {
    mockedGet.mockResolvedValue( {
      ...settingsFixture(),
      linker_locked_instructions: null,
      agent_status: 'unavailable',
    } )
    const { result } = renderHookWithClient( () => useSettings() )

    expect( result.current ).toMatchObject( { agentStatus: null, linkerLockedInstructions: null } )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current ).toMatchObject( {
      agentStatus: 'unavailable',
      linkerLockedInstructions: null,
    } )
  } )

  it( 'returns the linker locked instructions when the agent answers', async () => {
    mockedGet.mockResolvedValue( settingsFixture() )
    const { result } = renderHookWithClient( () => useSettings() )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current ).toMatchObject( {
      agentStatus: 'ok',
      linkerLockedInstructions: 'You propose links.',
    } )
  } )

  it( 'returns the syllabus locked instructions from the agent, or null', async () => {
    mockedGet.mockResolvedValue( settingsFixture() )

    const { result } = renderHookWithClient( () => useSettings() )

    expect( result.current.syllabusLockedInstructions ).toBeNull()

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.syllabusLockedInstructions ).toBe( 'You draft a syllabus.' )

    mockedGet.mockResolvedValue( { ...settingsFixture(), syllabus_locked_instructions: null } )

    const down = renderHookWithClient( () => useSettings() )

    await vi.waitFor( () => expect( down.result.current.isLoading ).toBe( false ) )
    expect( down.result.current.syllabusLockedInstructions ).toBeNull()
  } )

  it( 'reports a load error', async () => {
    mockedGet.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useSettings() )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Could not reach the server' ) )
    expect( result.current.settings ).toBeNull()
  } )

  it( 'saves a change and puts the response in the cache', async () => {
    mockedGet.mockResolvedValue( settingsFixture() )
    const updated = settingsFixture( { default_model: 'claude-opus-5-5' } )
    mockedUpdate.mockResolvedValue( updated )
    const { result, queryClient } = renderHookWithClient( () => useSettings() )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )

    act( () => result.current.updateSettings.mutate( { default_model: 'claude-opus-5-5' } ) )

    await vi.waitFor( () => expect( result.current.updateSettings.isSuccess ).toBe( true ) )
    expect( mockedUpdate ).toHaveBeenCalledWith( { default_model: 'claude-opus-5-5' } )
    expect( queryClient.getQueryData( settingsKeys.all ) ).toEqual( updated )
    expect( result.current.settings?.default_model ).toBe( 'claude-opus-5-5' )
  } )

  it( 'refreshes the Melete data after a save (the learning root is a setting)', async () => {
    mockedGet.mockResolvedValue( settingsFixture() )
    mockedUpdate.mockResolvedValue( settingsFixture() )
    const { result, queryClient } = renderHookWithClient( () => useSettings() )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    act( () => result.current.updateSettings.mutate( { melete_learning_root: 'Learning' } ) )

    await vi.waitFor( () => expect( result.current.updateSettings.isSuccess ).toBe( true ) )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.all } )
  } )

  it( 'keeps the old settings and reports a failed save', async () => {
    mockedGet.mockResolvedValue( settingsFixture() )
    mockedUpdate.mockRejectedValue( new ApiError( 'Unknown model: x', 400 ) )
    const { result, queryClient } = renderHookWithClient( () => useSettings() )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )

    act( () => result.current.updateSettings.mutate( { default_model: 'x' } ) )

    await vi.waitFor( () => expect( result.current.updateSettings.isError ).toBe( true ) )
    expect( result.current.updateSettings.error?.message ).toBe( 'Unknown model: x' )
    expect( queryClient.getQueryData( settingsKeys.all ) ).toEqual( settingsFixture() )
  } )
} )

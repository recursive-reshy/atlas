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
import { runBackup } from '../api/backups.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { statusKeys } from './queryKeys'
import { useRunBackup } from './useRunBackup'

vi.mock( '../api/backups.api' )

const result = { file: 'atlas-20261023-043000.db', bytes: 4096, at: '2026-10-22T20:30:00.000Z' }

beforeEach( () => {
  vi.mocked( runBackup ).mockReset()
} )

describe( 'useRunBackup', () => {
  it( 'runs the backup, exposes the result and refreshes the status', async () => {
    vi.mocked( runBackup ).mockResolvedValue( result )

    const { result: hook, queryClient } = renderHookWithClient( () => useRunBackup() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    await act( () => hook.current.mutateAsync() )

    expect( runBackup ).toHaveBeenCalledOnce()
    expect( hook.current.data ).toEqual( result )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: statusKeys.all } )
  } )

  it( 'exposes the error and still refreshes the status', async () => {
    vi.mocked( runBackup ).mockRejectedValue( new Error( 'Backup failed: disk full' ) )

    const { result: hook, queryClient } = renderHookWithClient( () => useRunBackup() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    await act( () => hook.current.mutateAsync().catch( () => undefined ) )

    expect( hook.current.error?.message ).toBe( 'Backup failed: disk full' )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: statusKeys.all } )
  } )
} )

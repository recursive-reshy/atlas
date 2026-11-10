// Packages
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { page } from 'vitest/browser'
// Shared
import type { UsageTotals } from '@atlas/shared'
// App
import { useAdminUsage } from '#src/features/admin/hooks/useAdminUsage'
import { useAdminUsers } from '#src/features/admin/hooks/useAdminUsers'
import { createQueryClient } from '#src/queryClient'
import { adminUserFixture, meFixture } from '#src/test-support/me.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { theme } from '#src/theme'
import { AdminTab } from './AdminTab'

vi.mock( '#src/features/admin/hooks/useAdminUsers' )
vi.mock( '#src/features/admin/hooks/useAdminUsage' )

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const
const MODES = [ 'light', 'dark' ] as const

const ADMIN = adminUserFixture( {
  id: meFixture().id,
  name: 'Naresh',
  email: 'naresh@example.com',
  role: 'admin',
  modules: [ 'transcriber', 'melete' ],
} )
const LONG = adminUserFixture( {
  name: 'A person with a rather long display name',
  email: `${ 'a-very-long-local-part'.repeat( 3 ) }@example.com`,
  vault_dir: 'a-very-long-vault-folder-name-for-testing',
} )
const REMOVED = adminUserFixture( {
  id: '5c8d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  name: 'Cousin',
  email: 'cousin@example.com',
  status: 'removed',
} )

const totals = ( cost_usd: number | null ): UsageTotals => ( {
  input_tokens: 1000,
  output_tokens: 500,
  cost_usd,
  runs: 3,
} )
const categories = ( cost: number | null ) => ( {
  summary: totals( cost ),
  linking: totals( cost ),
  melete: totals( cost ),
  extraction: totals( cost ),
  transcription: totals( null ),
} )

const renderTab = ( mode: ( typeof MODES )[ number ] ): void => {
  const router = createMemoryRouter(
    [ { path: '/', element: <AdminTab /> } ],
    { initialEntries: [ '/' ] },
  )

  render(
    <ThemeProvider theme={ theme } defaultMode={ mode } storageManager={ null } noSsr>
      <CssBaseline />
      <QueryClientProvider client={ createQueryClient() }>
        <RouterProvider router={ router } />
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

beforeEach( () => {
  vi.mocked( useAdminUsers ).mockReturnValue( {
    users: [ ADMIN, LONG, REMOVED ],
    isLoading: false,
    error: null,
    createUser: mutationStub(),
    updateUser: mutationStub(),
    resetVault: mutationStub(),
    deleteUser: mutationStub(),
  } )
  vi.mocked( useAdminUsage ).mockReturnValue( {
    usage: {
      month: '2026-10',
      time_zone: 'Asia/Singapore',
      users: [ ADMIN, LONG, REMOVED ].map( ( { id } ) => ( {
        user_id: id,
        month: categories( 12.3456 ),
        all_time: categories( null ),
        transcription: { month_seconds: 3600, all_time_seconds: 360000 },
      } ) ),
    },
    isLoading: false,
    error: null,
  } )
} )

describe.each( SIZES )( 'AdminTab at $name size', ( { width, height } ) => {
  it.each( MODES )( 'keeps the page itself from scrolling sideways, %s', async ( mode ) => {
    await page.viewport( width, height )
    renderTab( mode )

    const { scrollWidth, clientWidth } = document.documentElement

    expect( screen.getAllByRole( 'listitem' ) ).toHaveLength( 3 )
    expect( scrollWidth ).toBeLessThanOrEqual( clientWidth )

    for( const card of screen.getAllByRole( 'listitem' ) ) {
      expect( card.getBoundingClientRect().right ).toBeLessThanOrEqual( window.innerWidth )
    }
  } )
} )

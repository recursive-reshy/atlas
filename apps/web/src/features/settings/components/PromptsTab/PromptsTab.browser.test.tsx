// Packages
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
// App
import { useMe } from '#src/app/useMe'
import { useMeleteProfiles } from '#src/features/melete/hooks/useMeleteProfiles'
import { usePromptProfiles } from '#src/features/settings/hooks/usePromptProfiles'
import { usePromptVersions } from '#src/features/settings/hooks/usePromptVersions'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import {
  meleteProfilesState,
  profilesState,
  settingsState,
} from '#src/test-support/hookStates'
import { createQueryClient } from '#src/queryClient'
import { meFixture } from '#src/test-support/me.fixture'
import { CODING_ID } from '#src/features/jobs/fixtures/summarizer.fixture'
import { theme } from '#src/theme'
import { PromptsTab } from './PromptsTab'

vi.mock( '#src/app/useMe' )
vi.mock( '#src/features/settings/hooks/useSettings' )
vi.mock( '#src/features/settings/hooks/usePromptProfiles' )
vi.mock( '#src/features/melete/hooks/useMeleteProfiles' )
vi.mock( '#src/features/settings/hooks/usePromptVersions' )

const LIST_WIDTH = 280

// Only the tab, without the app shell, so the test measures its own layout.
const renderTab = ( path: string ): void => {
  const router = createMemoryRouter(
    [
      { path: '/settings/prompts', element: <PromptsTab /> },
      { path: '/settings/prompts/:promptId', element: <PromptsTab /> },
    ],
    { initialEntries: [ path ] },
  )

  render(
    <ThemeProvider theme={ theme } defaultMode="system" noSsr>
      <QueryClientProvider client={ createQueryClient() }>
        <RouterProvider router={ router } />
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

beforeEach( () => {
  vi.mocked( useMe ).mockReturnValue( { me: meFixture(), isLoading: false, error: null } )
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
  vi.mocked( useMeleteProfiles ).mockReturnValue( meleteProfilesState() )
  vi.mocked( usePromptVersions ).mockReturnValue(
    { versions: [], isLoading: false, error: null },
  )
} )

describe( 'PromptsTab layout in a real browser', () => {
  it( 'puts a 280px list beside an editor that takes the rest of the width', async () => {
    await page.viewport( 1400, 900 )
    renderTab( `/settings/prompts/${ CODING_ID }` )

    const list = screen.getByRole( 'list', { name: 'Summary profiles' } )
    const editor = screen.getByRole( 'textbox', { name: 'Guidance' } )
    const listBox = list.getBoundingClientRect()
    const editorBox = editor.getBoundingClientRect()

    await expect.poll( () => list.getBoundingClientRect().width ).toBeCloseTo( LIST_WIDTH, 0 )
    expect( editorBox.left ).toBeGreaterThanOrEqual( listBox.right )
    expect( editorBox.width ).toBeGreaterThan( 500 )
    expect( Math.abs( editorBox.top - listBox.top ) ).toBeLessThan( 400 )
  } )

  it( 'shows the list alone on a narrow window', async () => {
    await page.viewport( 500, 900 )
    renderTab( '/settings/prompts' )

    await expect.poll( () => screen.queryByRole( 'list', { name: 'Summary profiles' } ) )
      .not.toBeNull()
    expect( screen.queryByRole( 'textbox', { name: 'Guidance' } ) ).not.toBeInTheDocument()
  } )
} )

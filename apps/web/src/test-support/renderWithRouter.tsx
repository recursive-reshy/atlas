// React
import type { ReactElement } from 'react'
// Packages
import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { InitialEntry, Location } from 'react-router'
// Testing Library
import { render } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
// Shared
import type { Me } from '@atlas/shared'
// App
import { meKeys } from '#src/hooks/queryKeys'
import { createQueryClient } from '#src/queryClient'
import { routes } from '#src/routes'
import { meFixture } from '#src/test-support/me.fixture'
import { theme } from '#src/theme'

interface RouterRender extends RenderResult {
  queryClient: QueryClient
  location: () => Location
}

// Renders the app's real routes in a memory data router, as main.tsx does in the browser. The
// signed-in user is already in the cache (the admin unless `me` says otherwise; null is signed
// out), so the gate lets the page through at once.
export const renderWithRouter = (
  path: InitialEntry = '/',
  { me = meFixture() }: { me?: Me | null } = {},
): RouterRender => {
  const queryClient = createQueryClient()
  queryClient.setQueryDefaults( meKeys.all, { staleTime: Infinity } )
  queryClient.setQueryData( meKeys.all, me )
  const router = createMemoryRouter( routes, { initialEntries: [ path ] } )
  const ui: ReactElement = (
    <ThemeProvider theme={ theme } defaultMode="system" noSsr>
      <QueryClientProvider client={ queryClient }>
        <RouterProvider router={ router } />
      </QueryClientProvider>
    </ThemeProvider>
  )

  return {
    ...render( ui ),
    queryClient,
    location: () => router.state.location,
  }
}

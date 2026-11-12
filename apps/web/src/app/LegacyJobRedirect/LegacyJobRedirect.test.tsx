// Testing Library
import { screen } from '@testing-library/react'
// Packages
import { Route, Routes } from 'react-router'
// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import { LegacyJobRedirect } from './LegacyJobRedirect'

describe( 'LegacyJobRedirect', () => {
  it( 'sends /jobs/:id to /transcriber/jobs/:id', () => {
    const { location } = renderWithClient(
      <Routes>
        <Route path="/jobs/:id" element={ <LegacyJobRedirect /> } />
        <Route path="/transcriber/jobs/:id" element={ <p>the job</p> } />
      </Routes>,
      { route: '/jobs/abc' },
    )

    expect( location().pathname ).toBe( '/transcriber/jobs/abc' )
    expect( screen.getByText( 'the job' ) ).toBeInTheDocument()
  } )
} )

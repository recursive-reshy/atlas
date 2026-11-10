// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { getGmailAccount } from './features/gmail/api/gmail.api'
import { useJob } from './features/jobs/hooks/useJob'
import { useMeleteToday } from './features/melete/hooks/useMeleteToday'
import { useNextReview } from './features/melete/hooks/useNextReview'
import { useSettings } from './features/settings/hooks/useSettings'
import { gmailAccountFixture } from './features/gmail/fixtures/gmail.fixture'
import { jobFixture } from './features/jobs/fixtures/job.fixture'
import { meleteTodayFixture } from './features/melete/fixtures/melete.fixture'
import { settingsState } from '#src/test-support/hookStates'
import { renderWithRouter } from '#src/test-support/renderWithRouter'

vi.mock( './features/gmail/api/gmail.api' )
vi.mock( './features/jobs/hooks/useJob' )
vi.mock( './features/melete/hooks/useMeleteToday' )
vi.mock( './features/melete/hooks/useNextReview' )
vi.mock( './features/settings/hooks/useSettings' )
vi.mock( './features/settings/components/SettingsLayout', () => ( {
  SettingsLayout: () => <h2>Settings</h2>,
} ) )

const mockedUseJob = vi.mocked( useJob )
const jobId = jobFixture().id

beforeEach( () => {
  mockedUseJob.mockReset()
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( getGmailAccount ).mockResolvedValue( gmailAccountFixture() )
  mockedUseJob.mockReturnValue( { job: null, error: null } )
} )

describe( 'App', () => {
  it( 'shows the heading and the form on the home route', () => {
    renderWithRouter( '/' )

    expect( screen.getByRole( 'heading', { level: 1, name: 'Atlas' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'form', { name: 'Add a video or article' } ) ).toBeInTheDocument()
  } )

  it( 'shows Melete\'s Today on /melete', () => {
    vi.mocked( useMeleteToday ).mockReturnValue(
      { today: meleteTodayFixture(), isLoading: false, error: null },
    )
    renderWithRouter( '/melete' )

    expect( screen.getByRole( 'heading', { name: 'Today' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Review all due' } ) ).toBeInTheDocument()
  } )

  it( 'shows the review screen on /melete/review', () => {
    vi.mocked( useNextReview ).mockReturnValue(
      { item: null, counts: null, isLoading: false, error: null },
    )
    renderWithRouter( '/melete/review' )

    expect( screen.getByText( 'All done for now' ) ).toBeInTheDocument()
  } )

  it( 'shows the job on /jobs/:id', () => {
    mockedUseJob.mockReturnValue( { job: jobFixture( { status: 'transcribing' } ), error: null } )
    renderWithRouter( `/jobs/${ jobId }` )

    expect( screen.getByRole( 'heading', { level: 1, name: 'Atlas' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Transcribing…' )
    expect( screen.queryByRole( 'form', { name: 'Add a video or article' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'shows the settings page on /settings', () => {
    renderWithRouter( '/settings' )

    expect( screen.getByRole( 'heading', { level: 2, name: 'Settings' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'form', { name: 'Add a video or article' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'sends an unknown path to the home route', () => {
    const { location } = renderWithRouter( '/nowhere' )

    expect( location().pathname ).toBe( '/' )
    expect( screen.getByRole( 'form', { name: 'Add a video or article' } ) ).toBeInTheDocument()
  } )
} )

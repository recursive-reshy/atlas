// Testing Library
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
import { createJob } from '#src/features/jobs/api/jobs.api'
import { useJobs } from '#src/features/jobs/hooks/useJobs'
import { useModels } from '#src/features/settings/hooks/useModels'
import { usePromptProfiles } from '#src/features/settings/hooks/usePromptProfiles'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { jobFixture } from '#src/features/jobs/fixtures/job.fixture'
import { modelsState, profilesState, settingsState } from '#src/test-support/hookStates'
import { CODING_ID, settingsFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { HomePage } from './HomePage'

vi.mock( '#src/features/jobs/api/jobs.api' )
vi.mock( '#src/features/jobs/hooks/useJobs' )
vi.mock( '#src/features/settings/hooks/useSettings' )
vi.mock( '#src/features/settings/hooks/useModels' )
vi.mock( '#src/features/settings/hooks/usePromptProfiles' )
vi.mock( '#src/features/inbox/components/Inbox', () => ( { Inbox: () => <p>inbox</p> } ) )

const mockedCreateJob = vi.mocked( createJob )
const mockedUseJobs = vi.mocked( useJobs )
const newJobId = '7a1d9e2c-3b4f-4c5d-8e6f-0a1b2c3d4e5f'
const validUrl = 'https://www.youtube.com/watch?v=cFoaK1OQRhw'

beforeEach( () => {
  mockedCreateJob.mockReset()
  mockedUseJobs.mockReset()
  mockedUseJobs.mockReturnValue( { jobs: [], error: null, updatedAt: 0 } )
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
  vi.mocked( useModels ).mockReturnValue( modelsState() )
  vi.mocked( usePromptProfiles ).mockReturnValue( profilesState() )
} )

describe( 'HomePage', () => {
  it( 'shows the submit form', () => {
    renderWithClient( <HomePage /> )

    expect( screen.getByRole( 'form', { name: 'Add a video or article' } ) ).toBeInTheDocument()
  } )

  it( 'shows the feed inbox between the form and the job list', () => {
    mockedUseJobs.mockReturnValue( {
      jobs: [ jobFixture( { title: 'How Rust Works', status: 'summarizing' } ) ],
      error: null,
      updatedAt: Date.now(),
    } )
    renderWithClient( <HomePage /> )

    const form = screen.getByRole( 'form', { name: 'Add a video or article' } )
    const inbox = screen.getByText( 'inbox' )
    const jobs = screen.getByRole( 'list', { name: 'Jobs' } )

    expect( form.compareDocumentPosition( inbox ) & Node.DOCUMENT_POSITION_FOLLOWING )
      .toBeTruthy()
    expect( inbox.compareDocumentPosition( jobs ) & Node.DOCUMENT_POSITION_FOLLOWING )
      .toBeTruthy()
  } )

  it( 'lists the jobs under the form', () => {
    mockedUseJobs.mockReturnValue( {
      jobs: [ jobFixture( { title: 'How Rust Works', status: 'summarizing' } ) ],
      error: null,
      updatedAt: Date.now(),
    } )
    renderWithClient( <HomePage /> )

    expect( screen.getByRole( 'link', { name: 'How Rust Works' } ) ).toBeInTheDocument()
  } )

  it( 'confirms a save with the vault path', () => {
    renderWithClient( <HomePage />, {
      route: { pathname: '/', state: { savedPath: 'Mnemosyne/How Rust Works.md' } },
    } )

    expect( screen.getByRole( 'status' ) )
      .toHaveTextContent( 'Saved to Mnemosyne/How Rust Works.md' )
  } )

  it( 'shows no confirmation without a saved path', () => {
    renderWithClient( <HomePage /> )

    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
  } )

  it( 'shows no list when there are no jobs', () => {
    renderWithClient( <HomePage /> )

    expect( screen.queryByRole( 'list', { name: 'Jobs' } ) ).not.toBeInTheDocument()
  } )

  it( 'creates a job and navigates to it', async () => {
    let resolve: ( id: string ) => void = () => undefined
    mockedCreateJob.mockReturnValue( new Promise< string >( ( resolver ) => {
      resolve = resolver
    } ) )
    const { location } = renderWithClient( <HomePage /> )
    const user = userEvent.setup()

    await user.type( screen.getByRole( 'textbox', { name: 'URL' } ), validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( mockedCreateJob ).toHaveBeenCalledWith( { url: validUrl } )
    expect( screen.getByRole( 'button', { name: 'Starting…' } ) ).toBeDisabled()

    await act( async () => {
      resolve( newJobId )
      await Promise.resolve()
    } )

    expect( location().pathname ).toBe( `/jobs/${ newJobId }` )
  } )

  it( 'shows a failed submit and lets the user try again', async () => {
    mockedCreateJob.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { location } = renderWithClient( <HomePage /> )
    const user = userEvent.setup()

    await user.type( screen.getByRole( 'textbox', { name: 'URL' } ), validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
    expect( screen.getByRole( 'button', { name: 'Transcribe' } ) ).toBeEnabled()
    expect( location().pathname ).toBe( '/' )
  } )
} )

describe( 'HomePage, summary options', () => {
  const submit = async ( user: ReturnType< typeof userEvent.setup > ): Promise< void > => {
    await user.type( screen.getByRole( 'textbox', { name: 'URL' } ), validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )
  }

  beforeEach( () => {
    mockedCreateJob.mockResolvedValue( newJobId )
  } )

  it( 'starts the selects on the settings defaults', () => {
    renderWithClient( <HomePage /> )

    expect( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
      .toHaveTextContent( 'Business ideas' )
    expect( screen.getByRole( 'combobox', { name: 'Model' } ) )
      .toHaveTextContent( 'Claude Sonnet 5.5' )
  } )

  it( 'starts on the saved defaults, not the shipped ones', () => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( {
      settings: settingsFixture( {
        default_model: 'claude-opus-5-5',
        default_profile_id: CODING_ID,
      } ).settings,
    } ) )
    renderWithClient( <HomePage /> )

    expect( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
      .toHaveTextContent( 'Coding' )
    expect( screen.getByRole( 'combobox', { name: 'Model' } ) )
      .toHaveTextContent( 'Claude Opus 5.5' )
  } )

  it( 'sends no options when nothing was changed', async () => {
    const user = userEvent.setup()
    renderWithClient( <HomePage /> )

    await submit( user )

    expect( mockedCreateJob ).toHaveBeenCalledExactlyOnceWith( { url: validUrl } )
  } )

  it( 'sends only the model when only the model was changed', async () => {
    const user = userEvent.setup()
    renderWithClient( <HomePage /> )

    await user.click( screen.getByRole( 'combobox', { name: 'Model' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Claude Opus 5.5' } ) )
    await submit( user )

    expect( mockedCreateJob )
      .toHaveBeenCalledExactlyOnceWith( { url: validUrl, model: 'claude-opus-5-5' } )
  } )

  it( 'sends the profile and the model when both were changed', async () => {
    const user = userEvent.setup()
    renderWithClient( <HomePage /> )

    await user.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Coding' } ) )
    await user.click( screen.getByRole( 'combobox', { name: 'Model' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Claude Opus 5.5' } ) )
    await submit( user )

    expect( mockedCreateJob ).toHaveBeenCalledExactlyOnceWith( {
      url: validUrl,
      model: 'claude-opus-5-5',
      profile_id: CODING_ID,
    } )
  } )

  it( 'sends nothing for a choice that was changed back to the default', async () => {
    const user = userEvent.setup()
    renderWithClient( <HomePage /> )

    await user.click( screen.getByRole( 'combobox', { name: 'Model' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Claude Opus 5.5' } ) )
    await user.click( screen.getByRole( 'combobox', { name: 'Model' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Claude Sonnet 5.5' } ) )
    await submit( user )

    expect( mockedCreateJob ).toHaveBeenCalledExactlyOnceWith( { url: validUrl } )
  } )

  it( 'still submits, with no options, while the settings are loading', async () => {
    const user = userEvent.setup()
    vi.mocked( useSettings ).mockReturnValue( settingsState( { settings: null, isLoading: true } ) )
    vi.mocked( useModels ).mockReturnValue(
      modelsState( { models: [], source: null, isLoading: true } ),
    )
    vi.mocked( usePromptProfiles ).mockReturnValue(
      profilesState( { profiles: [], isLoading: true } ),
    )
    renderWithClient( <HomePage /> )

    expect( screen.getByRole( 'combobox', { name: 'Model' } ) )
      .toHaveAttribute( 'aria-disabled', 'true' )

    await submit( user )

    expect( mockedCreateJob ).toHaveBeenCalledExactlyOnceWith( { url: validUrl } )
  } )
} )

describe( 'HomePage, articles', () => {
  const articleUrl = 'https://example.com/posts/ownership'
  const pasted = 'Pasted words go here. '.repeat( 15 )

  beforeEach( () => {
    mockedCreateJob.mockResolvedValue( newJobId )
  } )

  it( 'submits an article URL without a source_type and goes to the job', async () => {
    const user = userEvent.setup()
    const { location } = renderWithClient( <HomePage /> )

    await user.type( screen.getByRole( 'textbox', { name: 'URL' } ), articleUrl )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( mockedCreateJob ).toHaveBeenCalledExactlyOnceWith( { url: articleUrl } )
    await vi.waitFor( () => expect( location().pathname ).toBe( `/jobs/${ newJobId }` ) )
  } )

  it( 'sends the type override and pasted text together with a changed model', async () => {
    const user = userEvent.setup()
    renderWithClient( <HomePage /> )

    await user.type( screen.getByRole( 'textbox', { name: 'URL' } ), validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Article' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Paste text instead' } ) )
    await user.click( screen.getByRole( 'textbox', { name: 'Article text' } ) )
    await user.paste( pasted )
    await user.click( screen.getByRole( 'combobox', { name: 'Model' } ) )
    await user.click( screen.getByRole( 'option', { name: 'Claude Opus 5.5' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( mockedCreateJob ).toHaveBeenCalledExactlyOnceWith( {
      url: validUrl,
      source_type: 'article',
      text: pasted.trim(),
      model: 'claude-opus-5-5',
    } )
  } )

  it( 'shows a server error from an article submission', async () => {
    const user = userEvent.setup()
    mockedCreateJob.mockRejectedValue( new ApiError( 'Pasted text is only for articles', 400 ) )
    renderWithClient( <HomePage /> )

    await user.type( screen.getByRole( 'textbox', { name: 'URL' } ), articleUrl )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( await screen.findByRole( 'alert' ) )
      .toHaveTextContent( 'Pasted text is only for articles' )
  } )
} )

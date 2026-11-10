// Testing Library
import { screen } from '@testing-library/react'
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
import { listGmailLabels } from '#src/features/gmail/api/gmail.api'
import { previewGmailSource } from '#src/features/gmail/api/gmailSources.api'
import {
  SOURCE_ID,
  gmailLabelFixture,
  gmailPreviewFixture,
  gmailSourceFixture,
} from '#src/features/gmail/fixtures/gmail.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { CODING_ID, profilesFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { EditGmailSourceDialog } from './EditGmailSourceDialog'

vi.mock( '#src/features/gmail/api/gmail.api' )
vi.mock( '#src/features/gmail/api/gmailSources.api' )

const mockedPreview = vi.mocked( previewGmailSource )

const jobsSource = gmailSourceFixture( {
  name: 'Upwork alerts',
  destination: 'jobs',
  match: { kind: 'query', query: 'from:donotreply@upwork.com' },
  label_names: [],
} )

const setup = (
  source = gmailSourceFixture(),
  overrides: Partial< Parameters< typeof EditGmailSourceDialog >[ 0 ] > = {},
) => {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()

  renderWithClient(
    <EditGmailSourceDialog
      source={ source }
      profiles={ profilesFixture() }
      isSubmitting={ false }
      error={ null }
      onSubmit={ onSubmit }
      onCancel={ onCancel }
      { ...overrides }
    />,
  )

  return { onSubmit, onCancel }
}

const name = (): HTMLElement => screen.getByRole( 'textbox', { name: 'Name' } )
const save = (): HTMLElement => screen.getByRole( 'button', { name: 'Save' } )

beforeEach( () => {
  vi.mocked( listGmailLabels ).mockReset()
  vi.mocked( listGmailLabels ).mockResolvedValue( [
    gmailLabelFixture( { id: 'Label_1', name: 'Newsletters' } ),
    gmailLabelFixture( { id: 'Label_2', name: 'Reading' } ),
  ] )
  mockedPreview.mockReset()
  mockedPreview.mockResolvedValue( gmailPreviewFixture() )
} )

describe( 'EditGmailSourceDialog', () => {
  it( 'is a dialog titled Edit Gmail source, and Cancel closes it', async () => {
    const { onCancel } = setup()

    expect( screen.getByRole( 'dialog', { name: 'Edit Gmail source' } ) ).toBeInTheDocument()

    await userEvent.click( screen.getByRole( 'button', { name: 'Cancel' } ) )

    expect( onCancel ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'shows the source\'s name and match, and the destination as fixed', () => {
    setup( jobsSource )

    expect( name() ).toHaveValue( 'Upwork alerts' )
    expect( screen.getByRole( 'textbox', { name: 'Gmail search' } ) )
      .toHaveValue( 'from:donotreply@upwork.com' )
    expect( screen.getByText( 'Destination: Freelance jobs' ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'radio' ) ).not.toBeInTheDocument()
  } )

  it( 'shows a label match with the label names', async () => {
    setup()

    expect( await screen.findByText( 'Newsletters' ) ).toBeInTheDocument()
  } )

  it( 'cannot be saved until something changes', () => {
    setup()

    expect( save() ).toBeDisabled()
  } )

  it( 'sends only the name when only the name changed', async () => {
    const { onSubmit } = setup()

    await userEvent.clear( name() )
    await userEvent.type( name(), '  Renamed ' )
    await userEvent.click( save() )

    expect( onSubmit ).toHaveBeenCalledWith( { name: 'Renamed' } )
  } )

  it( 'will not save a blank name', async () => {
    setup()

    await userEvent.clear( name() )

    expect( save() ).toBeDisabled()
  } )

  describe( 'a newsletter source', () => {
    it( 'shows its profile and auto-summarize, and no backfill', () => {
      setup( gmailSourceFixture( { profile_id: CODING_ID, auto_summarize: true } ) )

      expect( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
        .toHaveTextContent( 'Coding' )
      expect( screen.getByRole( 'checkbox', { name: 'Summarize automatically' } ) ).toBeChecked()
      expect( screen.queryByRole( 'combobox', { name: 'Backfill' } ) ).not.toBeInTheDocument()
      expect( screen.getByText( 'Destination: Newsletter' ) ).toBeInTheDocument()
    } )

    it( 'sends a changed profile and auto-summarize', async () => {
      const { onSubmit } = setup()

      await userEvent.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
      await userEvent.click( screen.getByRole( 'option', { name: 'Coding' } ) )
      await userEvent.click( screen.getByRole( 'checkbox', { name: 'Summarize automatically' } ) )
      await userEvent.click( save() )

      expect( onSubmit ).toHaveBeenCalledWith( { profile_id: CODING_ID, auto_summarize: true } )
    } )

    it( 'clears the profile with null when the default is chosen', async () => {
      const { onSubmit } = setup( gmailSourceFixture( { profile_id: CODING_ID } ) )

      await userEvent.click( screen.getByRole( 'combobox', { name: 'Prompt profile' } ) )
      await userEvent.click( screen.getByRole( 'option', { name: 'Default profile' } ) )
      await userEvent.click( save() )

      expect( onSubmit ).toHaveBeenCalledWith( { profile_id: null } )
    } )
  } )

  describe( 'a jobs source', () => {
    it( 'has no newsletter fields', () => {
      setup( jobsSource )

      expect( screen.queryByRole( 'combobox', { name: 'Prompt profile' } ) ).not.toBeInTheDocument()
      expect( screen.queryByRole( 'checkbox' ) ).not.toBeInTheDocument()
    } )
  } )

  describe( 'changing the match', () => {
    const changeQuery = async ( text: string ): Promise< void > => {
      const field = screen.getByRole( 'textbox', { name: 'Gmail search' } )

      await userEvent.clear( field )
      await userEvent.type( field, text )
    }

    it( 'needs a preview of the new match before it can be saved', async () => {
      const { onSubmit } = setup( jobsSource )

      await changeQuery( 'from:freelancer.com' )

      expect( save() ).toBeDisabled()

      await userEvent.click( screen.getByRole( 'button', { name: 'Preview' } ) )
      await screen.findByText( '12 emails match' )

      expect( mockedPreview ).toHaveBeenCalledWith(
        { kind: 'query', query: 'from:freelancer.com' },
      )

      await userEvent.click( save() )

      expect( onSubmit ).toHaveBeenCalledWith( {
        match: { kind: 'query', query: 'from:freelancer.com' },
      } )
    } )

    it( 'does not offer a preview of the match it already has', () => {
      setup( jobsSource )

      expect( screen.queryByRole( 'button', { name: 'Preview' } ) ).not.toBeInTheDocument()
    } )

    it( 'forgets the preview when the match changes again', async () => {
      setup( jobsSource )

      await changeQuery( 'from:freelancer.com' )
      await userEvent.click( screen.getByRole( 'button', { name: 'Preview' } ) )
      await screen.findByText( '12 emails match' )
      await userEvent.type( screen.getByRole( 'textbox', { name: 'Gmail search' } ), 'x' )

      expect( screen.queryByText( '12 emails match' ) ).not.toBeInTheDocument()
      expect( save() ).toBeDisabled()
    } )

    it( 'saves again, with no match change, once the match is put back', async () => {
      const { onSubmit } = setup( jobsSource )

      await changeQuery( 'from:freelancer.com' )
      await changeQuery( 'from:donotreply@upwork.com' )
      await userEvent.clear( name() )
      await userEvent.type( name(), 'Renamed' )
      await userEvent.click( save() )

      expect( onSubmit ).toHaveBeenCalledWith( { name: 'Renamed' } )
    } )

    it( 'does not warn that the source overlaps itself', async () => {
      mockedPreview.mockResolvedValue( gmailPreviewFixture( { overlaps: [
        { id: SOURCE_ID, name: 'Upwork alerts' },
      ] } ) )
      setup( gmailSourceFixture( { ...jobsSource, id: SOURCE_ID } ) )

      await changeQuery( 'from:freelancer.com' )
      await userEvent.click( screen.getByRole( 'button', { name: 'Preview' } ) )
      await screen.findByText( '12 emails match' )

      expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
    } )

    it( 'warns about the other sources it overlaps', async () => {
      mockedPreview.mockResolvedValue( gmailPreviewFixture( { overlaps: [
        { id: SOURCE_ID, name: 'Itself' },
        { id: '2c0a6b6e-5b1f-4a53-8a86-0f3f5a7c9d11', name: 'Other source' },
      ] } ) )
      setup( gmailSourceFixture( { ...jobsSource, id: SOURCE_ID } ) )

      await changeQuery( 'from:freelancer.com' )
      await userEvent.click( screen.getByRole( 'button', { name: 'Preview' } ) )

      expect( await screen.findByRole( 'alert' ) ).toHaveTextContent( 'Other source' )
      expect( screen.getByRole( 'alert' ) ).not.toHaveTextContent( 'Itself' )
    } )
  } )

  it( 'shows Saving… while it saves, and why it failed', () => {
    setup( gmailSourceFixture(), { isSubmitting: true, error: 'Gmail source not found' } )

    expect( screen.getByRole( 'button', { name: 'Saving…' } ) ).toBeDisabled()
    expect( screen.getByText( 'Gmail source not found' ) ).toBeInTheDocument()
  } )
} )

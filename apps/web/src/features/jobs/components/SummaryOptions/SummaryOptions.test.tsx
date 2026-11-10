// Testing Library
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import {
  BUSINESS_ID,
  CODING_ID,
  modelsFixture,
  profilesFixture,
} from '#src/features/jobs/fixtures/summarizer.fixture'
import { SummaryOptions } from './SummaryOptions'

const base = {
  profiles: profilesFixture(),
  models: modelsFixture().models,
  profileId: BUSINESS_ID,
  model: 'claude-sonnet-5-5',
  isLoading: false,
  onProfileChange: vi.fn(),
  onModelChange: vi.fn(),
}

const profileSelect = (): HTMLElement => screen.getByRole( 'combobox', { name: 'Prompt profile' } )
const modelSelect = (): HTMLElement => screen.getByRole( 'combobox', { name: 'Model' } )

describe( 'SummaryOptions', () => {
  it( 'shows the chosen profile by name and model by display name', () => {
    renderWithClient( <SummaryOptions { ...base } /> )

    expect( profileSelect() ).toHaveTextContent( 'Business ideas' )
    expect( modelSelect() ).toHaveTextContent( 'Claude Sonnet 5.5' )
  } )

  it( 'lists every profile and model', async () => {
    const user = userEvent.setup()
    renderWithClient( <SummaryOptions { ...base } /> )

    await user.click( profileSelect() )
    const profiles = within( screen.getByRole( 'listbox' ) ).getAllByRole( 'option' )

    expect( profiles.map( ( option ) => option.textContent ) )
      .toEqual( [ 'Business ideas', 'Coding', 'General' ] )
  } )

  it( 'reports a chosen profile by id', async () => {
    const user = userEvent.setup()
    const onProfileChange = vi.fn()
    renderWithClient( <SummaryOptions { ...base } onProfileChange={ onProfileChange } /> )

    await user.click( profileSelect() )
    await user.click( screen.getByRole( 'option', { name: 'Coding' } ) )

    expect( onProfileChange ).toHaveBeenCalledExactlyOnceWith( CODING_ID )
  } )

  it( 'reports a chosen model by id', async () => {
    const user = userEvent.setup()
    const onModelChange = vi.fn()
    renderWithClient( <SummaryOptions { ...base } onModelChange={ onModelChange } /> )

    await user.click( modelSelect() )
    await user.click( screen.getByRole( 'option', { name: 'Claude Opus 5.5' } ) )

    expect( onModelChange ).toHaveBeenCalledExactlyOnceWith( 'claude-opus-5-5' )
  } )

  it( 'is disabled and says Default while loading', () => {
    renderWithClient(
      <SummaryOptions { ...base } profiles={ [] } models={ [] } profileId="" model="" isLoading />,
    )

    expect( profileSelect() ).toHaveAttribute( 'aria-disabled', 'true' )
    expect( modelSelect() ).toHaveAttribute( 'aria-disabled', 'true' )
    expect( profileSelect() ).toHaveTextContent( 'Default' )
    expect( modelSelect() ).toHaveTextContent( 'Default' )
  } )

  it( 'still shows a chosen model that is not in the list, by its id', () => {
    renderWithClient( <SummaryOptions { ...base } model="claude-retired-1" /> )

    expect( modelSelect() ).toHaveTextContent( 'claude-retired-1' )
  } )
} )

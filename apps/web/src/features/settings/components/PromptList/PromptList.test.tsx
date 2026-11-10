// Testing Library
import { screen, within } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { renderWithClient } from '#src/test-support/renderWithClient'
import {
  BUSINESS_ID,
  CODING_ID,
  MELETE_GRADING_ID,
  MELETE_QUESTIONS_ID,
  meleteProfilesFixture,
  profilesFixture,
} from '#src/features/jobs/fixtures/summarizer.fixture'
import { PromptList } from './PromptList'

const setup = (
  selectedId: string | null = null,
  meleteProfiles = meleteProfilesFixture(),
  hasSummary = true,
) => {
  return renderWithClient(
    <PromptList
      hasSummary={ hasSummary }
      profiles={ profilesFixture() }
      meleteProfiles={ meleteProfiles }
      defaultId={ BUSINESS_ID }
      selectedId={ selectedId }
    />,
  )
}

describe( 'PromptList', () => {
  it( 'groups the summary profiles and the linker prompt', () => {
    setup()

    const summary = screen.getByRole( 'list', { name: 'Summary profiles' } )
    const linking = screen.getByRole( 'list', { name: 'Linking' } )

    expect( within( summary ).getAllByRole( 'link' ).map( ( link ) => link.textContent ) )
      .toEqual( [ 'Business ideasDefault', 'Coding', 'General' ] )
    expect( within( linking ).getByRole( 'link', { name: 'Linker prompt' } ) )
      .toHaveAttribute( 'href', '/settings/prompts/linker' )
  } )

  it( 'groups the five Melete prompts after Linking', () => {
    setup()

    const melete = screen.getByRole( 'list', { name: 'Melete' } )

    expect( within( melete ).getAllByRole( 'link' ).map( ( link ) => link.textContent ) )
      .toEqual( [
        'Melete questions',
        'Melete grading',
        'Melete syllabus',
        'Melete mapping',
        'Melete suggestions',
      ] )
    expect( within( melete ).getByRole( 'link', { name: 'Melete questions' } ) )
      .toHaveAttribute( 'href', `/settings/prompts/${ MELETE_QUESTIONS_ID }` )
    expect( within( melete ).getByRole( 'link', { name: 'Melete grading' } ) )
      .toHaveAttribute( 'href', `/settings/prompts/${ MELETE_GRADING_ID }` )
    expect( within( melete ).queryByText( 'Default' ) ).not.toBeInTheDocument()
  } )

  it( 'leaves the summary profiles and the linker out for a user without Transcriber', () => {
    setup( null, meleteProfilesFixture(), false )

    expect( screen.queryByRole( 'list', { name: 'Summary profiles' } ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'list', { name: 'Linking' } ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'list', { name: 'Melete' } ) ).toBeInTheDocument()
  } )

  it( 'leaves the Melete group out until its prompts are loaded', () => {
    setup( null, [] )

    expect( screen.queryByRole( 'list', { name: 'Melete' } ) ).not.toBeInTheDocument()
  } )

  it( 'marks a selected Melete prompt as the current page', () => {
    setup( MELETE_GRADING_ID )

    expect( screen.getByRole( 'link', { name: 'Melete grading' } ) )
      .toHaveAttribute( 'aria-current', 'page' )
  } )

  it( 'links each profile to its own address', () => {
    setup()

    expect( screen.getByRole( 'link', { name: 'Coding' } ) )
      .toHaveAttribute( 'href', `/settings/prompts/${ CODING_ID }` )
  } )

  it( 'marks the default with text, not colour alone', () => {
    setup()

    const business = screen.getByRole( 'link', { name: /Business ideas/ } )

    expect( within( business ).getByText( 'Default' ) ).toBeInTheDocument()
    expect( within( screen.getByRole( 'link', { name: 'Coding' } ) ).queryByText( 'Default' ) )
      .not.toBeInTheDocument()
  } )

  it( 'marks the selected profile as the current page', () => {
    setup( CODING_ID )

    expect( screen.getByRole( 'link', { name: 'Coding' } ) )
      .toHaveAttribute( 'aria-current', 'page' )
    expect( screen.getByRole( 'link', { name: /Business ideas/ } ) )
      .not.toHaveAttribute( 'aria-current' )
  } )

  it( 'marks the linker prompt when it is selected', () => {
    setup( 'linker' )

    expect( screen.getByRole( 'link', { name: 'Linker prompt' } ) )
      .toHaveAttribute( 'aria-current', 'page' )
  } )
} )

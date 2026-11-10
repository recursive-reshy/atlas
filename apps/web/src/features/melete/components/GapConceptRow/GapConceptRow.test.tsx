// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import type { MeleteGapConcept } from '@atlas/shared'
// App
import { gapsFixture } from '#src/features/melete/fixtures/gaps.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { GapConceptRow } from './GapConceptRow'

vi.mock( '../SuggestResources', () => ( {
  SuggestResources: ( { conceptName }: { conceptName: string } ) => (
    <button type="button">{ `Suggest for ${ conceptName }` }</button>
  ),
} ) )

const [ basics, advanced ] = gapsFixture().sections
const [ solid, weak ] = basics.concepts
const [ uncovered ] = advanced.concepts

const setup = ( concept: MeleteGapConcept, isNext = false ) => {
  renderWithClient( <GapConceptRow concept={ concept } isNext={ isNext } /> )
}

describe( 'GapConceptRow', () => {
  it( 'names the concept and describes it', () => {
    setup( uncovered )

    expect( screen.getByText( 'Unions' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Either-or types' ) ).toBeInTheDocument()
  } )

  it.each( [
    [ 'solid', solid, 'Solid' ],
    [ 'weak', weak, 'Weak' ],
    [ 'uncovered', uncovered, 'Not covered' ],
  ] )( 'says in words that a %s concept is %s', ( _name, concept, label ) => {
    setup( concept )

    expect( screen.getByText( label ) ).toBeInTheDocument()
  } )

  it( 'shows the mastery of a covered concept as a percentage and a bar', () => {
    setup( weak )

    expect( screen.getByRole( 'progressbar', { name: 'Narrowing mastery' } ) )
      .toHaveAttribute( 'aria-valuenow', '30' )
    expect( screen.getByText( '30%' ) ).toBeInTheDocument()
  } )

  it( 'shows no mastery for a concept no note reaches', () => {
    setup( uncovered )

    expect( screen.queryByRole( 'progressbar' ) ).not.toBeInTheDocument()
  } )

  it( 'counts its notes and questions', () => {
    setup( solid )

    expect( screen.getByText( '2 notes · 4 questions' ) ).toBeInTheDocument()
  } )

  it( 'uses the singular for one note or one question', () => {
    setup( { ...weak, note_count: 1, question_count: 1 } )

    expect( screen.getByText( '1 note · 1 question' ) ).toBeInTheDocument()
  } )

  it( 'links to a review of the concept when it has questions', () => {
    setup( weak )

    expect( screen.getByRole( 'link', { name: 'Review Narrowing' } ) )
      .toHaveAttribute( 'href', `/melete/review?concept=${ weak.id }` )
  } )

  it( 'offers no review for a concept without questions', () => {
    setup( uncovered )

    expect( screen.queryByRole( 'link', { name: /Review/ } ) ).not.toBeInTheDocument()
  } )

  it( 'offers resources for a concept that is not solid, and not for a solid one', () => {
    setup( weak )
    expect( screen.getByRole( 'button', { name: 'Suggest for Narrowing' } ) ).toBeInTheDocument()
  } )

  it( 'does not offer resources for a solid concept', () => {
    setup( solid )
    expect( screen.queryByRole( 'button', { name: /Suggest/ } ) ).not.toBeInTheDocument()
  } )

  it( 'marks the next step', () => {
    setup( uncovered, true )

    expect( screen.getByText( 'Next' ) ).toBeInTheDocument()
  } )

  it( 'marks nothing when it is not the next step', () => {
    setup( uncovered )

    expect( screen.queryByText( 'Next' ) ).not.toBeInTheDocument()
  } )
} )

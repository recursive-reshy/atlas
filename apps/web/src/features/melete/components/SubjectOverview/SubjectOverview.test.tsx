// Testing Library
import { screen, within } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useMeleteGaps } from '#src/features/melete/hooks/useMeleteGaps'
import {
  NARROWING_ID,
  gapsFixture,
} from '#src/features/melete/fixtures/gaps.fixture'
import { SUBJECT_ID } from '#src/features/melete/fixtures/melete.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { SubjectOverview } from './SubjectOverview'

vi.mock( '#src/features/melete/hooks/useMeleteGaps' )
vi.mock( '../SuggestResources', () => ( { SuggestResources: () => null } ) )

const show = ( overrides = {} ): void => {
  vi.mocked( useMeleteGaps ).mockReturnValue( {
    gaps: gapsFixture(),
    isLoading: false,
    error: null,
    ...overrides,
  } )
}

beforeEach( () => {
  show()
} )

describe( 'SubjectOverview', () => {
  it( 'loads the gaps of the subject', () => {
    renderWithClient( <SubjectOverview subjectId={ SUBJECT_ID } /> )

    expect( useMeleteGaps ).toHaveBeenCalledWith( SUBJECT_ID )
  } )

  it( 'shows a status while loading', () => {
    show( { gaps: null, isLoading: true } )
    renderWithClient( <SubjectOverview subjectId={ SUBJECT_ID } /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading' )
  } )

  it( 'shows an error', () => {
    show( { gaps: null, error: 'Server down' } )
    renderWithClient( <SubjectOverview subjectId={ SUBJECT_ID } /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Server down' )
  } )

  it( 'shows coverage and mastery for the subject as bars and percentages', () => {
    renderWithClient( <SubjectOverview subjectId={ SUBJECT_ID } /> )

    expect( screen.getByRole( 'progressbar', { name: 'Coverage' } ) )
      .toHaveAttribute( 'aria-valuenow', '67' )
    expect( screen.getByRole( 'progressbar', { name: 'Mastery' } ) )
      .toHaveAttribute( 'aria-valuenow', '50' )
    expect( screen.getByText( 'Coverage 67%' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Mastery 50%' ) ).toBeInTheDocument()
  } )

  it( 'lists the sections in order, each with its roll-up and its concepts', () => {
    renderWithClient( <SubjectOverview subjectId={ SUBJECT_ID } /> )

    const sections = screen.getAllByRole( 'region' )

    expect( sections.map( ( section ) => section.getAttribute( 'aria-label' ) ) )
      .toEqual( [ 'Basics', 'Advanced' ] )
    expect( within( sections[ 0 ] ).getByText( 'Coverage 100% · Mastery 75%' ) )
      .toBeInTheDocument()
    expect( within( sections[ 0 ] ).getByText( 'Generics' ) ).toBeInTheDocument()
    expect( within( sections[ 0 ] ).getByText( 'Narrowing' ) ).toBeInTheDocument()
    expect( within( sections[ 1 ] ).getByText( 'Unions' ) ).toBeInTheDocument()
  } )

  it( 'says to cover the next uncovered concept and marks it', () => {
    renderWithClient( <SubjectOverview subjectId={ SUBJECT_ID } /> )

    expect( screen.getByText( /Next: cover “Unions”/ ) ).toBeInTheDocument()
    expect( screen.getAllByText( 'Next' ) ).toHaveLength( 1 )
    expect( within( screen.getByRole( 'region', { name: 'Advanced' } ) ).getByText( 'Next' ) )
      .toBeInTheDocument()
  } )

  it( 'says to review the weakest concept, with a link to review it', () => {
    show( { gaps: gapsFixture( { next_step: { kind: 'review', concept_id: NARROWING_ID } } ) } )
    renderWithClient( <SubjectOverview subjectId={ SUBJECT_ID } /> )

    expect( screen.getByText( /Next: review “Narrowing”/ ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Review this concept' } ) )
      .toHaveAttribute( 'href', `/melete/review?concept=${ NARROWING_ID }` )
  } )

  it( 'offers no review link when the next step is to cover a concept', () => {
    renderWithClient( <SubjectOverview subjectId={ SUBJECT_ID } /> )

    expect( screen.queryByRole( 'link', { name: 'Review this concept' } ) )
      .not.toBeInTheDocument()
  } )

  it( 'says so when every concept is solid', () => {
    show( { gaps: gapsFixture( { next_step: { kind: 'none' } } ) } )
    renderWithClient( <SubjectOverview subjectId={ SUBJECT_ID } /> )

    expect( screen.getByText( /every concept is solid/i ) ).toBeInTheDocument()
  } )

  it( 'says the syllabus has no concepts when there are no numbers', () => {
    show( { gaps: gapsFixture( { coverage: null, mastery: null, sections: [] } ) } )
    renderWithClient( <SubjectOverview subjectId={ SUBJECT_ID } /> )

    expect( screen.getByText( /no concepts/i ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'progressbar' ) ).not.toBeInTheDocument()
  } )
} )

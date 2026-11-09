// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// App
import { meleteSubjectFixture, SUBJECT_ID } from '#src/test-support/melete.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { MeleteSubjectRow } from './MeleteSubjectRow'

describe( 'MeleteSubjectRow', () => {
  it( 'links the name to the subject page and shows its counts', () => {
    renderWithClient( <MeleteSubjectRow subject={ meleteSubjectFixture() } /> )

    expect( screen.getByRole( 'link', { name: 'TypeScript' } ) )
      .toHaveAttribute( 'href', `/melete/subjects/${ SUBJECT_ID }` )
    expect( screen.getByText( '4 due · 5 new · 3 of 8 enrolled' ) ).toBeInTheDocument()
  } )

  it( 'offers a review of just this subject', () => {
    renderWithClient( <MeleteSubjectRow subject={ meleteSubjectFixture() } /> )

    const review = screen.getByRole( 'link', { name: 'Review TypeScript' } )
    expect( review ).toHaveAttribute( 'href', `/melete/review?subject=${ SUBJECT_ID }` )
    expect( review ).not.toHaveAttribute( 'aria-disabled' )
  } )

  it( 'disables the review when nothing is due or new', () => {
    const subject = meleteSubjectFixture( { due_count: 0, new_remaining_today: 0 } )
    renderWithClient( <MeleteSubjectRow subject={ subject } /> )

    expect( screen.getByRole( 'link', { name: 'Review TypeScript' } ) )
      .toHaveAttribute( 'aria-disabled', 'true' )
  } )

  describe( 'the syllabus', () => {
    const approved = ( overrides = {} ) => meleteSubjectFixture( {
      syllabus_status: 'approved',
      target_level: 'working',
      coverage: 2 / 3,
      mastery: 0.25,
      concept_count: 12,
      ...overrides,
    } )

    it.each( [ 'none', 'drafting', 'draft', 'failed' ] as const )(
      'invites setting one up while it is %s',
      ( status ) => {
        renderWithClient( <MeleteSubjectRow subject={ meleteSubjectFixture( {
          syllabus_status: status,
        } ) } /> )

        expect( screen.getByRole( 'link', { name: 'Set up syllabus' } ) )
          .toHaveAttribute( 'href', `/melete/subjects/${ SUBJECT_ID }?tab=syllabus` )
        expect( screen.queryByRole( 'progressbar' ) ).not.toBeInTheDocument()
      },
    )

    it( 'shows the level and coverage and mastery as two bars once approved', () => {
      renderWithClient( <MeleteSubjectRow subject={ approved() } /> )

      expect( screen.getByText( 'Working knowledge' ) ).toBeInTheDocument()
      expect( screen.getByRole( 'progressbar', { name: 'TypeScript coverage' } ) )
        .toHaveAttribute( 'aria-valuenow', '67' )
      expect( screen.getByRole( 'progressbar', { name: 'TypeScript mastery' } ) )
        .toHaveAttribute( 'aria-valuenow', '25' )
      expect( screen.getByText( 'Coverage 67%' ) ).toBeInTheDocument()
      expect( screen.getByText( 'Mastery 25%' ) ).toBeInTheDocument()
      expect( screen.queryByRole( 'link', { name: 'Set up syllabus' } ) ).not.toBeInTheDocument()
    } )

    it( 'shows no bars for an approved syllabus without concepts', () => {
      const subject = approved( { coverage: null, mastery: null } )

      renderWithClient( <MeleteSubjectRow subject={ subject } /> )

      expect( screen.queryByRole( 'progressbar' ) ).not.toBeInTheDocument()
    } )
  } )

  it( 'shows what is due today and the time studied this week', () => {
    renderWithClient( <MeleteSubjectRow subject={ meleteSubjectFixture( {
      due_today: 7,
      seconds_this_week: 65 * 60,
    } ) } /> )

    expect( screen.getByText( '7 due today · 1 h 5 min this week' ) ).toBeInTheDocument()
  } )
} )


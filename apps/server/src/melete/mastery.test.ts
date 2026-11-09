// Packages
import { describe, it, expect } from 'vitest'
// Melete
import {
  MASTERY_THRESHOLD,
  computeConceptStats,
  nextStep,
  questionScore,
  rollUp,
} from './mastery.js'

describe( 'questionScore', () => {
  it.each( [
    [ 0, 0, 21, 0 ],
    [ 0, 30, 21, 0 ],
    [ 1, 0, 21, 0 ],
    [ 1, 10.5, 21, 0.5 ],
    [ 3, 21, 21, 1 ],
    [ 9, 90, 21, 1 ],
    [ 2, 7, 14, 0.5 ],
  ] )( 'reps %i, stability %f days over %i days is %f', ( reps, stability, days, expected ) => {
    expect( questionScore( { reps, stability }, days ) ).toBeCloseTo( expected )
  } )
} )

const concept = (
  id: string,
  overrides: Partial< Parameters< typeof computeConceptStats >[ 0 ][ number ] > = {},
) => ( {
  id,
  sectionId: 's1',
  noteCount: 1,
  questions: [] as { reps: number, stability: number }[],
  ...overrides,
} )

describe( 'computeConceptStats', () => {
  it( 'calls a concept with no live mapped note uncovered, whatever its questions say', () => {
    const [ stat ] = computeConceptStats(
      [ concept( 'a', { noteCount: 0, questions: [ { reps: 3, stability: 30 } ] } ) ],
      21,
    )

    expect( stat ).toMatchObject( { bucket: 'uncovered', mastery: 0, note_count: 0 } )
  } )

  it( 'gives a covered concept with no questions yet a mastery of 0, so it is weak', () => {
    const [ stat ] = computeConceptStats( [ concept( 'a' ) ], 21 )

    expect( stat ).toMatchObject( {
      bucket: 'weak',
      mastery: 0,
      note_count: 1,
      question_count: 0,
    } )
  } )

  it( 'averages the scores of its questions, counting unreviewed ones as 0', () => {
    const [ stat ] = computeConceptStats( [ concept( 'a', {
      questions: [
        { reps: 4, stability: 21 },
        { reps: 0, stability: 0 },
      ],
    } ) ], 21 )

    expect( stat ).toMatchObject( { mastery: 0.5, question_count: 2, bucket: 'weak' } )
  } )

  it( 'is solid from exactly the threshold, and weak just under it', () => {
    const at = { reps: 5, stability: 21 * MASTERY_THRESHOLD }
    const under = { reps: 5, stability: 21 * MASTERY_THRESHOLD - 0.01 }

    expect( computeConceptStats( [ concept( 'a', { questions: [ at ] } ) ], 21 )[ 0 ]?.bucket )
      .toBe( 'solid' )
    expect( computeConceptStats( [ concept( 'a', { questions: [ under ] } ) ], 21 )[ 0 ]?.bucket )
      .toBe( 'weak' )
  } )

  it( 'follows the days setting for every concept at once', () => {
    const inputs = [ concept( 'a', { questions: [ { reps: 2, stability: 14 } ] } ) ]

    expect( computeConceptStats( inputs, 21 )[ 0 ]?.bucket ).toBe( 'weak' )
    expect( computeConceptStats( inputs, 14 )[ 0 ]?.bucket ).toBe( 'solid' )
  } )

  it( 'keeps the order and the section of each concept', () => {
    const stats = computeConceptStats(
      [ concept( 'b', { sectionId: 's2' } ), concept( 'a' ) ],
      21,
    )

    expect( stats.map( ( { id, section_id: sectionId } ) => [ id, sectionId ] ) )
      .toEqual( [ [ 'b', 's2' ], [ 'a', 's1' ] ] )
  } )
} )

describe( 'rollUp', () => {
  const stats = computeConceptStats( [
    concept( 'solid', { questions: [ { reps: 5, stability: 42 } ] } ),
    concept( 'weak', { questions: [ { reps: 1, stability: 10.5 } ] } ),
    concept( 'uncovered', { noteCount: 0 } ),
    concept( 'empty' ),
  ], 21 )

  it( 'reports coverage as the share covered and mastery as the mean over all concepts', () => {
    expect( rollUp( stats ) ).toEqual( { coverage: 0.75, mastery: ( 1 + 0.5 + 0 + 0 ) / 4 } )
  } )

  it( 'never lets mastery pass coverage', () => {
    const { coverage, mastery } = rollUp( stats ) ?? { coverage: 0, mastery: 1 }

    expect( mastery ).toBeLessThanOrEqual( coverage )
  } )

  it( 'rolls up a part of the syllabus the same way', () => {
    expect( rollUp( stats.filter( ( { id } ) => id === 'uncovered' ) ) )
      .toEqual( { coverage: 0, mastery: 0 } )
  } )

  it( 'is null when there are no concepts', () => {
    expect( rollUp( [] ) ).toBeNull()
  } )
} )

describe( 'nextStep', () => {
  const stepOf = ( inputs: ReturnType< typeof concept >[] ) => {
    return nextStep( computeConceptStats( inputs, 21 ) )
  }
  const solid = { reps: 5, stability: 40 }

  it( 'covers the first uncovered concept in syllabus order', () => {
    expect( stepOf( [
      concept( 'a', { questions: [ solid ] } ),
      concept( 'b', { noteCount: 0 } ),
      concept( 'c', { noteCount: 0 } ),
    ] ) ).toEqual( { kind: 'cover', concept_id: 'b' } )
  } )

  it( 'covers before it reviews, even when a weak concept comes first', () => {
    expect( stepOf( [ concept( 'a' ), concept( 'b', { noteCount: 0 } ) ] ) )
      .toEqual( { kind: 'cover', concept_id: 'b' } )
  } )

  it( 'reviews the weakest covered concept once everything is covered, the first on a tie', () => {
    expect( stepOf( [
      concept( 'a', { questions: [ { reps: 1, stability: 10 } ] } ),
      concept( 'b', { questions: [ { reps: 1, stability: 4 } ] } ),
      concept( 'c', { questions: [ { reps: 1, stability: 4 } ] } ),
      concept( 'd', { questions: [ solid ] } ),
    ] ) ).toEqual( { kind: 'review', concept_id: 'b' } )
  } )

  it( 'has nothing to suggest when every concept is solid, or there are none', () => {
    expect( stepOf( [ concept( 'a', { questions: [ solid ] } ) ] ) ).toEqual( { kind: 'none' } )
    expect( stepOf( [] ) ).toEqual( { kind: 'none' } )
  } )
} )

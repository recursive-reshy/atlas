// Packages
import { describe, expect, it } from 'vitest'
// Melete
import type { ConceptStat } from '../melete/mastery.js'
// Themis
import { pooledLearning } from './overview.js'

const stat = ( bucket: ConceptStat[ 'bucket' ], mastery: number ): ConceptStat => ( {
  id: crypto.randomUUID(),
  section_id: 's',
  bucket,
  mastery,
  note_count: bucket === 'uncovered' ? 0 : 1,
  question_count: 1,
} )

describe( 'pooledLearning', () => {
  it( 'has nothing to average without a concept', () => {
    expect( pooledLearning( [] ) ).toEqual( { coverage: null, mastery: null, concept_count: 0 } )
    expect( pooledLearning( [ [], [] ] ) )
      .toEqual( { coverage: null, mastery: null, concept_count: 0 } )
  } )

  it( 'is the subject\'s own numbers for one subject', () => {
    expect( pooledLearning( [ [ stat( 'solid', 1 ), stat( 'uncovered', 0 ) ] ] ) )
      .toEqual( { coverage: 0.5, mastery: 0.5, concept_count: 2 } )
  } )

  it( 'weights every concept alike, not every subject', () => {
    const big = Array.from( { length: 8 }, () => stat( 'solid', 1 ) )
    const small = [ stat( 'uncovered', 0 ), stat( 'uncovered', 0 ) ]

    // Subjects alone would give 0.5 (the mean of 1 and 0); pooled it is 8 of 10
    expect( pooledLearning( [ big, small ] ) )
      .toEqual( { coverage: 0.8, mastery: 0.8, concept_count: 10 } )
  } )

  it( 'counts uncovered concepts as 0 mastery, so mastery stays within coverage', () => {
    const pooled = pooledLearning( [ [ stat( 'weak', 0.4 ) ], [ stat( 'uncovered', 0 ) ] ] )

    expect( pooled.coverage ).toBe( 0.5 )
    expect( pooled.mastery ).toBeCloseTo( 0.2 )
  } )
} )

// Packages
import { describe, it, expect } from 'vitest'
// Melete
import { buildMapUser, processMap } from './map.js'

const concepts = [
  { id: 'id-1', name: 'Generics', description: 'Types with parameters' },
  { id: 'id-2', name: 'Narrowing', description: '' },
  { id: 'id-3', name: 'Unions', description: '' },
]
const questions = [
  { id: 'q-1', prompt: 'What is a generic?', answer: 'A parameterised type.', concept_id: null },
  { id: 'q-2', prompt: 'What is narrowing?', answer: 'Refining a union.', concept_id: 'id-2' },
]

describe( 'buildMapUser', () => {
  it( 'lists the concepts as refs, then the note, then the numbered questions', () => {
    expect( buildMapUser( { concepts, body: 'The note.', questions } ) ).toBe( [
      '## Concepts',
      'c1: Generics — Types with parameters',
      'c2: Narrowing',
      'c3: Unions',
      '',
      '## Note',
      'The note.',
      '',
      '## Questions',
      '1. What is a generic?',
      '   Answer: A parameterised type.',
      '2. What is narrowing?',
      '   Answer: Refining a union.',
    ].join( '\n' ) )
  } )

  it( 'says there are no questions when there are none', () => {
    expect( buildMapUser( { concepts, body: 'The note.', questions: [] } ) )
      .toContain( '## Questions\nNo questions yet.' )
  } )

  it( 'names the fixed concepts of a labels-only run by their refs', () => {
    const user = buildMapUser( {
      concepts,
      body: 'The note.',
      questions,
      fixedIds: [ 'id-3', 'id-1' ],
    } )

    expect( user ).toContain( '## Fixed concepts\nThe note\'s concepts are already set: c3, c1.' )
    expect( user.indexOf( '## Fixed concepts' ) ).toBeLessThan( user.indexOf( '## Note' ) )
  } )
} )

describe( 'processMap', () => {
  const full = {
    concepts: [ 'c1', 'c2' ],
    off_syllabus: null,
    labels: [ { question: 1, concept: 'c1' }, { question: 2, concept: 'c2' } ],
  }

  it( 'maps refs to ids and labels each question by its number', () => {
    expect( processMap( full, concepts, questions ) ).toEqual( {
      conceptIds: [ 'id-1', 'id-2' ],
      offSyllabus: null,
      labels: [
        { questionId: 'q-1', conceptId: 'id-1' },
        { questionId: 'q-2', conceptId: 'id-2' },
      ],
    } )
  } )

  it( 'drops unknown refs and question numbers out of range', () => {
    const result = processMap( {
      concepts: [ 'c9', 'c1' ],
      off_syllabus: null,
      labels: [ { question: 1, concept: 'c1' }, { question: 7, concept: 'c1' } ],
    }, concepts, questions )

    expect( result.conceptIds ).toEqual( [ 'id-1' ] )
    expect( result.labels ).toHaveLength( 2 )
  } )

  it( 'keeps a question\'s own label when Claude gives none or one outside the concepts', () => {
    const result = processMap( {
      concepts: [ 'c2' ],
      off_syllabus: null,
      labels: [ { question: 1, concept: 'c3' } ],
    }, concepts, questions )

    // 1 was labelled with a concept the note doesn't have and had none: first concept;
    // 2 was not labelled: it keeps id-2
    expect( result.labels ).toEqual( [
      { questionId: 'q-1', conceptId: 'id-2' },
      { questionId: 'q-2', conceptId: 'id-2' },
    ] )
  } )

  it( 'falls back to the first concept when the old label is no longer one of them', () => {
    const result = processMap( {
      concepts: [ 'c1' ],
      off_syllabus: null,
      labels: [],
    }, concepts, questions )

    expect( result.labels.map( ( { conceptId } ) => conceptId ) ).toEqual( [ 'id-1', 'id-1' ] )
  } )

  it( 'uses the first label given for a question', () => {
    const result = processMap( {
      concepts: [ 'c1', 'c2' ],
      off_syllabus: null,
      labels: [ { question: 1, concept: 'c2' }, { question: 1, concept: 'c1' } ],
    }, concepts, questions )

    expect( result.labels[ 0 ]?.conceptId ).toBe( 'id-2' )
  } )

  it( 'leaves every question unlabelled and flags the note when no concept fits', () => {
    const result = processMap( {
      concepts: [],
      off_syllabus: { suggested_concept: ' Decorators ' },
      labels: [ { question: 1, concept: 'c1' } ],
    }, concepts, questions )

    expect( result ).toEqual( {
      conceptIds: [],
      offSyllabus: 'Decorators',
      labels: [
        { questionId: 'q-1', conceptId: null },
        { questionId: 'q-2', conceptId: null },
      ],
    } )
  } )

  it( 'ignores a suggestion when there are concepts, or when it is blank', () => {
    expect( processMap( {
      ...full,
      off_syllabus: { suggested_concept: 'Decorators' },
    }, concepts, questions ).offSyllabus ).toBeNull()
    expect( processMap( {
      concepts: [],
      off_syllabus: { suggested_concept: '  ' },
      labels: [],
    }, concepts, questions ).offSyllabus ).toBeNull()
  } )

  describe( 'labels only', () => {
    it( 'keeps the fixed concepts whatever Claude says of them, and reads only the labels', () => {
      const result = processMap( {
        concepts: [ 'c1' ],
        off_syllabus: { suggested_concept: 'Decorators' },
        labels: [ { question: 1, concept: 'c3' }, { question: 2, concept: 'c1' } ],
      }, concepts, questions, [ 'id-3', 'id-1' ] )

      expect( result ).toEqual( {
        conceptIds: [ 'id-3', 'id-1' ],
        offSyllabus: null,
        labels: [
          { questionId: 'q-1', conceptId: 'id-3' },
          { questionId: 'q-2', conceptId: 'id-1' },
        ],
      } )
    } )

    it( 'labels nothing when the note has no concepts', () => {
      expect( processMap( full, concepts, questions, [] ).labels )
        .toEqual( [
          { questionId: 'q-1', conceptId: null },
          { questionId: 'q-2', conceptId: null },
        ] )
    } )
  } )
} )

// Packages
import { describe, it, expect } from 'vitest'
// Melete
import { processApprovedQuestions, processQuestions } from './questions.js'

const question = ( overrides: Record< string, string > = {} ) => ( {
  prompt: 'What is narrowing?',
  answer: 'Refining a union type inside a branch.',
  passage: '',
  ...overrides,
} )

const body = 'Narrowing refines a union\ntype inside a branch.\n\nA typeof check narrows it.'

describe( 'processQuestions', () => {
  it( 'trims every field', () => {
    const [ first ] = processQuestions(
      {
        questions: [ question( {
          prompt: '  Why?  ',
          answer: ' Because. ',
          passage: ' A typeof check narrows it. ',
        } ) ],
      },
      body,
    )

    expect( first ).toEqual( {
      prompt: 'Why?',
      answer: 'Because.',
      passage: 'A typeof check narrows it.',
    } )
  } )

  it( 'drops a question with an empty prompt or answer, keeping the order of the rest', () => {
    const result = processQuestions( {
      questions: [
        question( { prompt: 'First?' } ),
        question( { prompt: '   ' } ),
        question( { answer: '  ' } ),
        question( { prompt: 'Last?' } ),
      ],
    }, body )

    expect( result.map( ( { prompt } ) => prompt ) ).toEqual( [ 'First?', 'Last?' ] )
  } )

  it( 'keeps the first 10 questions', () => {
    const questions = Array.from(
      { length: 12 },
      ( _, index ) => question( { prompt: `Q${ index }?` } ),
    )
    const result = processQuestions( { questions }, body )

    expect( result ).toHaveLength( 10 )
    expect( result[ 9 ]?.prompt ).toBe( 'Q9?' )
  } )

  it( 'counts the cap after dropping empty questions', () => {
    const questions = [
      question( { prompt: '' } ),
      ...Array.from( { length: 10 }, ( _, index ) => question( { prompt: `Q${ index }?` } ) ),
    ]

    expect( processQuestions( { questions }, body ) ).toHaveLength( 10 )
  } )

  it( 'keeps a passage that is in the body', () => {
    const [ first ] = processQuestions(
      { questions: [ question( { passage: 'A typeof check narrows it.' } ) ] },
      body,
    )

    expect( first?.passage ).toBe( 'A typeof check narrows it.' )
  } )

  it( 'keeps a passage that matches once whitespace is normalised, as the model wrote it', () => {
    const passage = 'Narrowing  refines a union type\r\ninside a branch.'
    const [ first ] = processQuestions( { questions: [ question( { passage } ) ] }, body )

    expect( first?.passage ).toBe( passage )
  } )

  it( 'empties a passage that is not in the body', () => {
    const [ first ] = processQuestions(
      { questions: [ question( { passage: 'Something the note never says.' } ) ] },
      body,
    )

    expect( first?.passage ).toBe( '' )
  } )

  it( 'leaves an empty passage empty', () => {
    expect( processQuestions( { questions: [ question() ] }, body )[ 0 ]?.passage ).toBe( '' )
  } )

  it( 'returns an empty list when every question is dropped', () => {
    expect( processQuestions( { questions: [ question( { prompt: '' } ) ] }, body ) ).toEqual( [] )
  } )
} )

describe( 'processApprovedQuestions', () => {
  const concepts = [
    { id: 'id-1', name: 'Narrowing', description: '' },
    { id: 'id-2', name: 'Unions', description: '' },
  ]
  const labelled = ( overrides: Record< string, string > = {} ) => ( {
    ...question(),
    concept: 'c1',
    ...overrides,
  } )

  it( 'maps the concept refs to ids and labels each question', () => {
    const result = processApprovedQuestions( {
      concepts: [ 'c1', 'c2' ],
      off_syllabus: null,
      questions: [ labelled(), labelled( { prompt: 'Second?', concept: 'c2' } ) ],
    }, body, concepts )

    expect( result.conceptIds ).toEqual( [ 'id-1', 'id-2' ] )
    expect( result.offSyllabus ).toBeNull()
    expect( result.questions.map( ( { concept_id: id } ) => id ) ).toEqual( [ 'id-1', 'id-2' ] )
  } )

  it( 'gives a question whose concept is not one of the note\'s the first concept', () => {
    const result = processApprovedQuestions( {
      concepts: [ 'c2' ],
      off_syllabus: null,
      questions: [ labelled( { concept: 'c1' } ), labelled( { concept: 'c9' } ) ],
    }, body, concepts )

    expect( result.questions.map( ( { concept_id: id } ) => id ) ).toEqual( [ 'id-2', 'id-2' ] )
  } )

  it( 'keeps the passage rule and the 10 question limit of processQuestions', () => {
    const result = processApprovedQuestions( {
      concepts: [ 'c1' ],
      off_syllabus: null,
      questions: [
        labelled( { passage: 'Not in the note' } ),
        labelled( { prompt: ' ' } ),
        ...Array.from( { length: 11 }, () => labelled() ),
      ],
    }, body, concepts )

    expect( result.questions ).toHaveLength( 10 )
    expect( result.questions[ 0 ]?.passage ).toBe( '' )
  } )

  it( 'flags the note off-syllabus when it has no concept and Claude suggests one', () => {
    const result = processApprovedQuestions( {
      concepts: [ 'c7' ],
      off_syllabus: { suggested_concept: '  Decorators ' },
      questions: [ labelled() ],
    }, body, concepts )

    expect( result.conceptIds ).toEqual( [] )
    expect( result.offSyllabus ).toBe( 'Decorators' )
    expect( result.questions[ 0 ]?.concept_id ).toBeNull()
  } )

  it( 'ignores the suggestion when the note has concepts, or when it is blank', () => {
    const base = { questions: [ labelled() ] }

    expect( processApprovedQuestions( {
      ...base,
      concepts: [ 'c1' ],
      off_syllabus: { suggested_concept: 'Decorators' },
    }, body, concepts ).offSyllabus ).toBeNull()
    expect( processApprovedQuestions( {
      ...base,
      concepts: [],
      off_syllabus: { suggested_concept: '   ' },
    }, body, concepts ).offSyllabus ).toBeNull()
  } )
} )

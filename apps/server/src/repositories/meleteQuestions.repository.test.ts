// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Test support
import { addNote, addQuestion, addSubject } from '../test-support/meleteData.fixture.js'
// Repositories
import {
  countBySubject,
  findQuestion,
  insertQuestions,
  listDue,
  listForNote,
  listLearningSoon,
  listNew,
  retireActiveForNote,
  saveCard,
  setState,
  setQuestionConcept,
} from './meleteQuestions.repository.js'
import type { CardRow } from './meleteQuestions.repository.js'
// Repositories
import { insertConcept } from './meleteConcepts.repository.js'
import { insertSection } from './meleteSections.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const now = '2026-10-22T10:00:00.000Z'
const past = '2026-10-22T09:00:00.000Z'
const future = '2026-10-23T10:00:00.000Z'
const yesterday = '2026-10-21T00:00:00.000Z'
const until = '2026-10-22T10:20:00.000Z'

const generated = ( count: number ): { prompt: string, answer: string, passage: string }[] => {
  return Array.from( { length: count }, ( _, index ) => ( {
    prompt: `Prompt ${ index + 1 }`,
    answer: `Answer ${ index + 1 }`,
    passage: index === 0 ? 'A passage' : '',
  } ) )
}

describe( 'insertQuestions with concepts', () => {
  it( 'stores the concept a question is labelled with, and null when it has none', () => {
    const subjectId = addSubject( userId )
    const noteId = addNote( userId, subjectId )
    const section = insertSection( userId, { subject_id: subjectId, name: 'S', position: 0 } )
    const concept = insertConcept( userId, {
      subject_id: subjectId,
      section_id: section.id,
      name: 'C',
      description: '',
      position: 0,
    } )
    const [ first, second ] = insertQuestions( userId, noteId, 1, 'h', [
      { prompt: 'A?', answer: 'A', passage: '', concept_id: concept.id },
      { prompt: 'B?', answer: 'B', passage: '' },
    ] )

    expect( first?.concept_id ).toBe( concept.id )
    expect( second?.concept_id ).toBeNull()
  } )
} )

describe( 'insertQuestions', () => {
  it( 'stores questions in order as new, active cards with the hash and run', () => {
    const noteId = addNote( userId, addSubject( userId ) )
    const questions = insertQuestions( userId, noteId, 7, 'hash-1', generated( 3 ) )

    expect( questions.map( ( { position, prompt } ) => [ position, prompt ] ) )
      .toEqual( [ [ 1, 'Prompt 1' ], [ 2, 'Prompt 2' ], [ 3, 'Prompt 3' ] ] )
    expect( questions[ 0 ] ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      note_id: noteId,
      position: 1,
      prompt: 'Prompt 1',
      answer: 'Answer 1',
      passage: 'A passage',
      body_hash: 'hash-1',
      state: 'active',
      run_id: 7,
      concept_id: null,
      due: null,
      stability: 0,
      difficulty: 0,
      scheduled_days: 0,
      learning_steps: 0,
      reps: 0,
      lapses: 0,
      fsrs_state: 'new',
      last_review: null,
      created_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )
  } )

  it( 'inserts nothing for an empty list', () => {
    expect( insertQuestions( userId, addNote( userId, addSubject( userId ) ), 1, 'h', [] ) )
      .toEqual( [] )
  } )

  it( 'inserts all or none', () => {
    const noteId = addNote( userId, addSubject( userId ) )
    const broken = [ ...generated( 2 ), { prompt: null, answer: 'x', passage: '' } ]

    expect( () => insertQuestions( userId, noteId, 1, 'h', broken as never ) ).toThrow()
    expect( listForNote( userId, noteId ) ).toEqual( [] )
  } )
} )

describe( 'findQuestion and listForNote', () => {
  it( 'finds a question and returns undefined for an unknown one', () => {
    const [ question ] = insertQuestions(
      userId,
      addNote( userId, addSubject( userId ) ),
      1,
      'h',
      generated( 1 ),
    )

    expect( findQuestion( userId, question?.id ?? '' ) ).toEqual( question )
    expect( findQuestion( userId, crypto.randomUUID() ) ).toBeUndefined()
  } )

  it( 'lists active and dropped questions by position, never retired ones', () => {
    const noteId = addNote( userId, addSubject( userId ) )

    addQuestion( userId, noteId, { position: 3 } )
    addQuestion( userId, noteId, { position: 1, state: 'dropped' } )
    addQuestion( userId, noteId, { position: 2, state: 'retired' } )
    addQuestion( userId, noteId, { position: 2 } )

    expect( listForNote( userId, noteId ).map( ( { position, state } ) => [ position, state ] ) )
      .toEqual( [ [ 1, 'dropped' ], [ 2, 'active' ], [ 3, 'active' ] ] )
  } )
} )

describe( 'setState and retireActiveForNote', () => {
  it( 'sets the state of the given questions only', () => {
    const noteId = addNote( userId, addSubject( userId ) )
    const a = addQuestion( userId, noteId )
    const b = addQuestion( userId, noteId, { position: 2 } )

    setState( userId, [ a ], 'dropped' )

    expect( findQuestion( userId, a )?.state ).toBe( 'dropped' )
    expect( findQuestion( userId, b )?.state ).toBe( 'active' )
    expect( () => setState( userId, [], 'dropped' ) ).not.toThrow()
  } )

  it( 'retires active questions of one note and leaves dropped ones and other notes alone', () => {
    const subjectId = addSubject( userId )
    const noteId = addNote( userId, subjectId )
    const otherNote = addNote( userId, subjectId )
    const active = addQuestion( userId, noteId )
    const dropped = addQuestion( userId, noteId, { position: 2, state: 'dropped' } )
    const elsewhere = addQuestion( userId, otherNote )

    expect( retireActiveForNote( userId, noteId ) ).toBe( 1 )
    expect( findQuestion( userId, active )?.state ).toBe( 'retired' )
    expect( findQuestion( userId, dropped )?.state ).toBe( 'dropped' )
    expect( findQuestion( userId, elsewhere )?.state ).toBe( 'active' )
  } )
} )

describe( 'saveCard', () => {
  it( 'round-trips every card column', () => {
    const id = addQuestion( userId, addNote( userId, addSubject( userId ) ) )
    const card: CardRow = {
      due: future,
      stability: 3.25,
      difficulty: 5.5,
      scheduled_days: 3,
      learning_steps: 1,
      reps: 4,
      lapses: 1,
      fsrs_state: 'relearning',
      last_review: now,
    }

    saveCard( userId, id, card )

    expect( findQuestion( userId, id ) ).toMatchObject( card )
  } )
} )

describe( 'the review queries', () => {
  const setup = () => {
    const subjectId = addSubject( userId, 'Learning/TS' )
    const otherSubject = addSubject( userId, 'Learning/Rust' )

    return { subjectId, otherSubject, noteId: addNote(
      userId,
      subjectId,
      { path: 'Learning/TS/a.md' },
    ) }
  }

  describe( 'listDue', () => {
    it( 'returns due questions, learning before review, then by due time', () => {
      const { subjectId, noteId } = setup()
      const review = addQuestion(
        userId,
        noteId,
        { position: 1, fsrsState: 'review', due: yesterday },
      )
      const learning = addQuestion(
        userId,
        noteId,
        { position: 2, fsrsState: 'learning', due: past },
      )
      const relearning = addQuestion( userId, noteId, {
        position: 3,
        fsrsState: 'relearning',
        due: '2026-10-22T09:30:00.000Z',
      } )
      const reviewLater = addQuestion( userId, noteId, {
        position: 4,
        fsrsState: 'review',
        due: '2026-10-22T08:00:00.000Z',
      } )

      addQuestion( userId, noteId, { position: 5, fsrsState: 'review', due: future } )

      expect( listDue( userId, { subjectIds: [ subjectId ], now } ).map( ( { id } ) => id ) )
        .toEqual( [ learning, relearning, review, reviewLater ] )
    } )

    it( 'includes a question due exactly now', () => {
      const { subjectId, noteId } = setup()
      const id = addQuestion( userId, noteId, { fsrsState: 'review', due: now } )

      expect( listDue( userId, { subjectIds: [ subjectId ], now } ).map( ( found ) => found.id ) )
        .toEqual( [ id ] )
    } )

    it( 'carries the subject id and stays within the subjects asked for', () => {
      const { subjectId, otherSubject, noteId } = setup()
      const otherNote = addNote( userId, otherSubject, { path: 'Learning/Rust/a.md' } )

      addQuestion( userId, noteId, { fsrsState: 'review', due: past } )
      addQuestion( userId, otherNote, { fsrsState: 'review', due: past } )

      const only = listDue( userId, { subjectIds: [ subjectId ], now } )
      const both = listDue( userId, { subjectIds: [ subjectId, otherSubject ], now } )

      expect( only.map( ( { subject_id } ) => subject_id ) ).toEqual( [ subjectId ] )
      expect( both ).toHaveLength( 2 )
      expect( listDue( userId, { subjectIds: [], now } ) ).toEqual( [] )
    } )

    it( 'includes a new question that was served but not rated yet', () => {
      const { subjectId, noteId } = setup()
      const served = addQuestion( userId, noteId, { fsrsState: 'new', due: past } )

      expect( listDue( userId, { subjectIds: [ subjectId ], now } ).map( ( { id } ) => id ) )
        .toEqual( [ served ] )
    } )

    it( 'leaves out new, dropped, retired, unenrolled and missing', () => {
      const { subjectId, noteId } = setup()
      const unenrolled = addNote( userId, subjectId, { path: 'Learning/TS/b.md', enrolled: false } )
      const missing = addNote( userId, subjectId, { path: 'Learning/TS/c.md', missingAt: past } )

      addQuestion( userId, noteId, { position: 1, fsrsState: 'new', due: null } )
      addQuestion(
        userId,
        noteId,
        { position: 2, fsrsState: 'review', due: past, state: 'dropped' },
      )
      addQuestion(
        userId,
        noteId,
        { position: 3, fsrsState: 'review', due: past, state: 'retired' },
      )
      addQuestion( userId, unenrolled, { fsrsState: 'review', due: past } )
      addQuestion( userId, missing, { fsrsState: 'review', due: past } )

      expect( listDue( userId, { subjectIds: [ subjectId ], now } ) ).toEqual( [] )
    } )
  } )

  describe( 'listNew', () => {
    it( 'returns new unscheduled questions by note enrollment time, path, then position', () => {
      const { subjectId } = setup()
      const enroll = ( path: string, enrolledAt: string ): string => {
        return addNote( userId, subjectId, { path, enrolledAt } )
      }
      const second = enroll( 'Learning/TS/b.md', '2026-10-01T00:00:00.000Z' )
      const first = enroll( 'Learning/TS/z.md', '2026-09-30T00:00:00.000Z' )
      const third = enroll( 'Learning/TS/c.md', '2026-10-01T00:00:00.000Z' )
      const q1 = addQuestion( userId, first, { position: 2 } )
      const q0 = addQuestion( userId, first, { position: 1 } )
      const q2 = addQuestion( userId, second )
      const q3 = addQuestion( userId, third )

      expect( listNew( userId, { subjectId, limit: 10 } ).map( ( { id } ) => id ) )
        .toEqual( [ q0, q1, q2, q3 ] )
    } )

    it( 'honours the limit, including zero', () => {
      const { subjectId, noteId } = setup()

      addQuestion( userId, noteId, { position: 1 } )
      addQuestion( userId, noteId, { position: 2 } )
      addQuestion( userId, noteId, { position: 3 } )

      expect( listNew( userId, { subjectId, limit: 2 } ) ).toHaveLength( 2 )
      expect( listNew( userId, { subjectId, limit: 0 } ) ).toEqual( [] )
    } )

    it( 'leaves out scheduled, dropped, retired, unenrolled, missing and other subjects', () => {
      const { subjectId, otherSubject, noteId } = setup()
      const unenrolled = addNote( userId, subjectId, { path: 'Learning/TS/b.md', enrolled: false } )
      const missing = addNote( userId, subjectId, { path: 'Learning/TS/c.md', missingAt: past } )
      const elsewhere = addNote( userId, otherSubject, { path: 'Learning/Rust/a.md' } )

      addQuestion( userId, noteId, { position: 1, fsrsState: 'learning', due: past } )
      addQuestion( userId, noteId, { position: 2, state: 'dropped' } )
      addQuestion( userId, noteId, { position: 3, state: 'retired' } )
      addQuestion( userId, unenrolled )
      addQuestion( userId, missing )
      addQuestion( userId, elsewhere )

      expect( listNew( userId, { subjectId, limit: 10 } ) ).toEqual( [] )
    } )
  } )

  describe( 'listLearningSoon', () => {
    it( 'returns learning and relearning questions due up to the cut-off, soonest first', () => {
      const { subjectId, noteId } = setup()
      const soon = addQuestion( userId, noteId, {
        position: 1,
        fsrsState: 'learning',
        due: '2026-10-22T10:05:00.000Z',
      } )
      const sooner = addQuestion( userId, noteId, {
        position: 2,
        fsrsState: 'relearning',
        due: '2026-10-22T10:02:00.000Z',
      } )

      addQuestion(
        userId,
        noteId,
        { position: 3, fsrsState: 'learning', due: '2026-10-22T10:30:00.000Z' },
      )
      addQuestion(
        userId,
        noteId,
        { position: 4, fsrsState: 'review', due: '2026-10-22T10:03:00.000Z' },
      )

      expect( listLearningSoon(
        userId,
        { subjectIds: [ subjectId ], until },
      ).map( ( { id } ) => id ) )
        .toEqual( [ sooner, soon ] )
      expect( listLearningSoon( userId, { subjectIds: [], until } ) ).toEqual( [] )
    } )

    it( 'leaves out dropped, unenrolled and missing', () => {
      const { subjectId, noteId } = setup()
      const unenrolled = addNote( userId, subjectId, { path: 'Learning/TS/b.md', enrolled: false } )
      const missing = addNote( userId, subjectId, { path: 'Learning/TS/c.md', missingAt: past } )
      const due = '2026-10-22T10:02:00.000Z'

      addQuestion( userId, noteId, { fsrsState: 'learning', due, state: 'dropped' } )
      addQuestion( userId, unenrolled, { fsrsState: 'learning', due } )
      addQuestion( userId, missing, { fsrsState: 'learning', due } )

      expect( listLearningSoon( userId, { subjectIds: [ subjectId ], until } ) ).toEqual( [] )
    } )
  } )

  describe( 'countBySubject', () => {
    it( 'counts due and new questions per subject', () => {
      const { subjectId, otherSubject, noteId } = setup()
      const otherNote = addNote( userId, otherSubject, { path: 'Learning/Rust/a.md' } )

      addQuestion( userId, noteId, { position: 1, fsrsState: 'review', due: past } )
      addQuestion( userId, noteId, { position: 2, fsrsState: 'learning', due: past } )
      addQuestion( userId, noteId, { position: 3, fsrsState: 'review', due: future } )
      addQuestion( userId, noteId, { position: 4 } )
      addQuestion( userId, otherNote, { position: 1 } )
      addQuestion( userId, otherNote, { position: 2 } )

      expect( countBySubject( userId, now ) ).toEqual( expect.arrayContaining( [
        { subject_id: subjectId, due: 2, new_available: 1 },
        { subject_id: otherSubject, due: 0, new_available: 2 },
      ] ) )
    } )

    it( 'gives a subject with no questions zeros and ignores excluded questions', () => {
      const { subjectId, noteId } = setup()
      const unenrolled = addNote( userId, subjectId, { path: 'Learning/TS/b.md', enrolled: false } )

      addQuestion( userId, noteId, { state: 'dropped', fsrsState: 'review', due: past } )
      addQuestion( userId, unenrolled, { fsrsState: 'review', due: past } )

      expect( countBySubject( userId, now ).find( ( counts ) => counts.subject_id === subjectId ) )
        .toEqual( { subject_id: subjectId, due: 0, new_available: 0 } )
    } )
  } )
} )

describe( 'ownership', () => {
  const seed = (): { subjectId: string, noteId: string, questionId: string } => {
    const subjectId = addSubject( userId )
    const noteId = addNote( userId, subjectId )
    const questionId = addQuestion( userId, noteId, { due: past, fsrsState: 'review' } )

    return { subjectId, noteId, questionId }
  }

  it( 'does not show another user\'s questions in any list or count', () => {
    const other = createTestUser().id
    const { subjectId, noteId, questionId } = seed()

    expect( findQuestion( other, questionId ) ).toBeUndefined()
    expect( listForNote( other, noteId ) ).toEqual( [] )
    expect( listDue( other, { subjectIds: [ subjectId ], now } ) ).toEqual( [] )
    expect( listNew( other, { subjectId, limit: 5 } ) ).toEqual( [] )
    expect( listLearningSoon( other, { subjectIds: [ subjectId ], until } ) ).toEqual( [] )
    expect( countBySubject( other, now ) ).toEqual( [] )
    expect( listDue( userId, { subjectIds: [ subjectId ], now } ) ).toHaveLength( 1 )
  } )

  it( 'does not change another user\'s questions', () => {
    const other = createTestUser().id
    const { noteId, questionId } = seed()

    setState( other, [ questionId ], 'dropped' )
    saveCard( other, questionId, {
      due: future,
      stability: 9,
      difficulty: 9,
      scheduled_days: 9,
      learning_steps: 0,
      reps: 9,
      lapses: 9,
      fsrs_state: 'review',
      last_review: now,
    } )

    expect( retireActiveForNote( other, noteId ) ).toBe( 0 )
    expect( findQuestion( userId, questionId ) )
      .toMatchObject( { state: 'active', reps: 0, due: past } )
  } )
} )

describe( 'setQuestionConcept', () => {
  const conceptFor = ( subjectId: string ): string => {
    const section = insertSection( userId, { subject_id: subjectId, name: 'S', position: 0 } )

    return insertConcept( userId, {
      subject_id: subjectId,
      section_id: section.id,
      name: 'C',
      description: '',
      position: 0,
    } ).id
  }

  it( 'labels a question with a concept and clears it again, keeping its card', () => {
    const subjectId = addSubject( userId )
    const questionId = addQuestion( userId, addNote( userId, subjectId ), { fsrsState: 'review' } )
    const conceptId = conceptFor( subjectId )

    expect( setQuestionConcept( userId, questionId, conceptId ) )
      .toMatchObject( { concept_id: conceptId, fsrs_state: 'review' } )
    expect( setQuestionConcept( userId, questionId, null ) )
      .toMatchObject( { concept_id: null, fsrs_state: 'review' } )
  } )

  it( 'does not label another user\'s question', () => {
    const subjectId = addSubject( userId )
    const questionId = addQuestion( userId, addNote( userId, subjectId ) )
    const other = createTestUser( { role: 'member', modules: [ 'melete' ] } ).id

    expect( setQuestionConcept( other, questionId, conceptFor( subjectId ) ) ).toBeUndefined()
    expect( findQuestion( userId, questionId )?.concept_id ).toBeNull()
  } )
} )

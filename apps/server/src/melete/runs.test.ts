// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Melete
import { recordMeleteRun } from './runs.js'
// Repositories
import { findRun } from '../repositories/meleteRuns.repository.js'
import {
  findLatestVersion,
  findProfileBySeedKey,
} from '../repositories/promptProfiles.repository.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''
let promptVersionId = 0

beforeEach( () => {
  userId = defaultTestAdmin().id
  promptVersionId = findLatestVersion(
    userId,
    findProfileBySeedKey( userId, 'melete_questions' )?.id ?? '',
  )?.id ?? 0
} )

describe( 'recordMeleteRun', () => {
  it( 'records a syllabus run against its subject, with tokens and cost', () => {
    const id = recordMeleteRun( userId, {
      kind: 'syllabus',
      subjectId: 'subject-1',
      model: 'claude-sonnet-5-5',
      promptVersionId,
      usage: { input_tokens: 1000, output_tokens: 500 },
      now: new Date( '2026-11-07T10:00:00.000Z' ),
    } )

    expect( findRun( userId, id ) ).toMatchObject( {
      kind: 'syllabus',
      subject_id: 'subject-1',
      note_id: null,
      question_id: null,
      input_tokens: 1000,
      output_tokens: 500,
      outcome: 'succeeded',
      error: null,
      created_at: '2026-11-07T10:00:00.000Z',
    } )
  } )

  it( 'records a failed map run with no usage and no subject', () => {
    const id = recordMeleteRun( userId, {
      kind: 'map',
      noteId: 'note-1',
      model: 'claude-haiku-5-5',
      promptVersionId,
      usage: undefined,
      error: 'Bad output',
      now: new Date( '2026-11-07T10:00:00.000Z' ),
    } )

    expect( findRun( userId, id ) ).toMatchObject( {
      kind: 'map',
      note_id: 'note-1',
      subject_id: null,
      input_tokens: null,
      cost_usd: null,
      outcome: 'failed',
      error: 'Bad output',
    } )
  } )

  it( 'records the turns and tool calls of an agent run', () => {
    const id = recordMeleteRun( userId, {
      kind: 'syllabus',
      subjectId: 'subject-1',
      model: 'claude-sonnet-5-5',
      promptVersionId,
      usage: { input_tokens: 1000, output_tokens: 500 },
      turns: 4,
      toolCalls: 7,
      now: new Date( '2026-11-07T10:00:00.000Z' ),
    } )

    expect( findRun( userId, id ) ).toMatchObject( { turns: 4, tool_calls: 7 } )
  } )

  it( 'leaves turns and tool calls empty for a run that is not an agent', () => {
    const id = recordMeleteRun( userId, {
      kind: 'map',
      noteId: 'note-1',
      model: 'claude-haiku-5-5',
      promptVersionId,
      usage: undefined,
      now: new Date( '2026-11-07T10:00:00.000Z' ),
    } )

    expect( findRun( userId, id ) ).toMatchObject( { turns: null, tool_calls: null } )
  } )
} )

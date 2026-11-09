// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import {
  GetThemisGoalResponse,
  GetThemisOverviewResponse,
  MeleteSubject,
  SetGoalSubjectsResponse,
  ThemisAreaResponse,
  ThemisGoalResponse,
} from '@atlas/shared'
// App
import { app } from '../app.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { listConcepts, replaceSyllabus } from '../repositories/meleteConcepts.repository.js'
import { setNoteConcepts } from '../repositories/meleteNoteConcepts.repository.js'
import { updateSubject } from '../repositories/meleteSubjects.repository.js'
import { insertCheckin } from '../repositories/themisCheckins.repository.js'
import { insertMetricUpdate } from '../repositories/themisMetrics.repository.js'
import {
  insertLoggedEntry,
  insertMeasuredEntry,
} from '../repositories/timeEntries.repository.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'
import { addNote, addQuestion, addSubject } from '../test-support/meleteData.fixture.js'

type Agent = ReturnType< typeof signedInRequest >

// A Wednesday; the study day starts at 04:00 in Asia/Singapore, so this is 2026-11-11
const WEDNESDAY = new Date( '2026-11-11T06:00:00.000Z' )

let user: ReturnType< typeof createTestUser >
let agent: Agent
let area = ''

const makeGoal = async (
  extra: Record< string, unknown > = { outcome: 'learning' },
  name = 'Goal',
  areaId = area,
): Promise< string > => {
  const response = await agent.post( '/api/themis/goals' )
    .send( { area_id: areaId, name, ...extra } )

  return ThemisGoalResponse.parse( response.body ).goal.id
}

const makeArea = async ( name: string ): Promise< string > => ThemisAreaResponse.parse(
  ( await agent.post( '/api/themis/areas' ).send( { name } ) ).body,
).area.id

// A subject with a syllabus of `concepts` single-concept sections, approved or not
const makeSubject = (
  folder: string,
  concepts: string[],
  status: 'approved' | 'draft' = 'approved',
  owner = user.id,
): { subject: string, concepts: string[] } => {
  const subject = addSubject( owner, folder )

  replaceSyllabus( owner, subject, [ {
    name: 'Section',
    concepts: concepts.map( ( name ) => ( { name, description: '' } ) ),
  } ] )
  updateSubject( owner, subject, { syllabus_status: status } )

  return { subject, concepts: listConcepts( owner, subject ).map( ( { id } ) => id ) }
}

const backdate = ( goalId: string, createdAt: string ): void => {
  getDatabase().prepare( 'UPDATE themis_goals SET created_at = ? WHERE id = ?' )
    .run( createdAt, goalId )
}

const goalIdOf = ( subject: string ): string | null => ( getDatabase()
  .prepare( 'SELECT goal_id FROM melete_subjects WHERE id = ?' )
  .get( subject ) as { goal_id: string | null } ).goal_id

beforeEach( async () => {
  vi.useFakeTimers( { toFake: [ 'Date' ] } )
  vi.setSystemTime( WEDNESDAY )
  user = createTestUser( { modules: [ 'melete', 'themis' ] } )
  agent = signedInRequest( app, user )
  area = await makeArea( 'Career' )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'PUT /api/themis/goals/:id/subjects', () => {
  it( 'links exactly the given subjects and returns them by name', async () => {
    const goal = await makeGoal()
    const a = addSubject( user.id, 'Learning/Alpha' )
    const b = addSubject( user.id, 'Learning/Beta' )
    const c = addSubject( user.id, 'Learning/Gamma' )

    await agent.put( `/api/themis/goals/${ goal }/subjects` ).send( { subject_ids: [ a, b ] } )

    const response = await agent.put( `/api/themis/goals/${ goal }/subjects` )
      .send( { subject_ids: [ c, b ] } )

    expect( response.status ).toBe( 200 )
    expect( SetGoalSubjectsResponse.parse( response.body ).subjects ).toEqual( [
      { id: b, name: 'Beta' },
      { id: c, name: 'Gamma' },
    ] )
    expect( [ goalIdOf( a ), goalIdOf( b ), goalIdOf( c ) ] ).toEqual( [ null, goal, goal ] )
  } )

  it( 'moves a subject over from the goal it was linked to', async () => {
    const first = await makeGoal( { outcome: 'learning' }, 'First' )
    const second = await makeGoal( { outcome: 'learning' }, 'Second' )
    const subject = addSubject( user.id )

    await agent.put( `/api/themis/goals/${ first }/subjects` ).send( { subject_ids: [ subject ] } )
    await agent.put( `/api/themis/goals/${ second }/subjects` ).send( { subject_ids: [ subject ] } )

    expect( goalIdOf( subject ) ).toBe( second )
  } )

  it( 'unlinks everything with an empty list', async () => {
    const goal = await makeGoal()
    const subject = addSubject( user.id )

    await agent.put( `/api/themis/goals/${ goal }/subjects` ).send( { subject_ids: [ subject ] } )

    const response = await agent.put( `/api/themis/goals/${ goal }/subjects` )
      .send( { subject_ids: [] } )

    expect( response.status ).toBe( 200 )
    expect( SetGoalSubjectsResponse.parse( response.body ).subjects ).toEqual( [] )
    expect( goalIdOf( subject ) ).toBeNull()
  } )

  it( 'answers 404 for a subject or goal that is not the user\'s', async () => {
    const goal = await makeGoal()
    const mine = addSubject( user.id )
    const other = createTestUser( { modules: [ 'melete', 'themis' ] } )
    const theirs = addSubject( other.id )

    await agent.put( `/api/themis/goals/${ goal }/subjects` ).send( { subject_ids: [ mine ] } )

    expect( ( await agent.put( `/api/themis/goals/${ goal }/subjects` )
      .send( { subject_ids: [ theirs ] } ) ).status ).toBe( 404 )
    expect( ( await agent.put( `/api/themis/goals/${ goal }/subjects` )
      .send( { subject_ids: [ crypto.randomUUID() ] } ) ).status ).toBe( 404 )
    expect( ( await signedInRequest( app, other ).put( `/api/themis/goals/${ goal }/subjects` )
      .send( { subject_ids: [ theirs ] } ) ).status ).toBe( 404 )
    expect( ( await agent.put( `/api/themis/goals/${ crypto.randomUUID() }/subjects` )
      .send( { subject_ids: [] } ) ).status ).toBe( 404 )
    expect( goalIdOf( mine ) ).toBe( goal )
    expect( goalIdOf( theirs ) ).toBeNull()
  } )

  it( 'needs the Melete module', async () => {
    const themisOnly = createTestUser( { modules: [ 'themis' ] } )
    const themisAgent = signedInRequest( app, themisOnly )
    const areaId = ThemisAreaResponse.parse(
      ( await themisAgent.post( '/api/themis/areas' ).send( { name: 'Career' } ) ).body,
    ).area.id
    const goal = ThemisGoalResponse.parse( ( await themisAgent.post( '/api/themis/goals' )
      .send( { area_id: areaId, name: 'G', outcome: 'learning' } ) ).body ).goal.id

    expect( ( await themisAgent.put( `/api/themis/goals/${ goal }/subjects` )
      .send( { subject_ids: [] } ) ).status ).toBe( 404 )
  } )

  it( 'refuses a body that is not a list of ids with 400', async () => {
    const goal = await makeGoal()

    expect( ( await agent.put( `/api/themis/goals/${ goal }/subjects` )
      .send( { subject_ids: [ 'x' ] } ) ).status ).toBe( 400 )
  } )
} )

describe( 'PATCH /api/melete/subjects/:id with goal_id', () => {
  it( 'links the subject to one of the user\'s active goals, and unlinks with null', async () => {
    const goal = await makeGoal()
    const subject = addSubject( user.id )

    const linked = await agent.patch( `/api/melete/subjects/${ subject }` )
      .send( { goal_id: goal } )

    expect( linked.status ).toBe( 200 )
    expect( MeleteSubject.parse( ( linked.body as { subject: unknown } ).subject ).goal_id )
      .toBe( goal )

    const unlinked = await agent.patch( `/api/melete/subjects/${ subject }` )
      .send( { goal_id: null } )

    expect( MeleteSubject.parse( ( unlinked.body as { subject: unknown } ).subject ).goal_id )
      .toBeNull()
  } )

  it( 'refuses an achieved or dropped goal with 400', async () => {
    const goal = await makeGoal()
    const subject = addSubject( user.id )

    await agent.patch( `/api/themis/goals/${ goal }` ).send( { status: 'achieved' } )

    expect( ( await agent.patch( `/api/melete/subjects/${ subject }` ).send( { goal_id: goal } ) )
      .status ).toBe( 400 )
    expect( goalIdOf( subject ) ).toBeNull()
  } )

  it( 'answers 404 for a goal that is unknown or another user\'s', async () => {
    const other = createTestUser( { modules: [ 'melete', 'themis' ] } )
    const otherAgent = signedInRequest( app, other )
    const otherArea = ThemisAreaResponse.parse(
      ( await otherAgent.post( '/api/themis/areas' ).send( { name: 'Theirs' } ) ).body,
    ).area.id
    const theirs = ThemisGoalResponse.parse( ( await otherAgent.post( '/api/themis/goals' )
      .send( { area_id: otherArea, name: 'T', outcome: 'learning' } ) ).body ).goal.id
    const subject = addSubject( user.id )

    expect( ( await agent.patch( `/api/melete/subjects/${ subject }` ).send( { goal_id: theirs } ) )
      .status ).toBe( 404 )
    expect( ( await agent.patch( `/api/melete/subjects/${ subject }` )
      .send( { goal_id: crypto.randomUUID() } ) ).status ).toBe( 404 )
  } )
} )

describe( 'GET /api/themis/goals/:id', () => {
  it( 'gives a metric goal its updates and outcome', async () => {
    const goal = await makeGoal( { outcome: 'metric', metric_unit: 'SGD', metric_target: 100 } )

    insertMetricUpdate( user.id, goal, { value: 10, at: '2026-11-01T00:00:00.000Z' } )
    insertMetricUpdate( user.id, goal, {
      value: 40,
      note: 'bonus',
      at: '2026-11-05T00:00:00.000Z',
    } )

    const response = await agent.get( `/api/themis/goals/${ goal }` )
    const detail = GetThemisGoalResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( detail.goal ).toMatchObject( { id: goal, outcome: 'metric' } )
    expect( detail.metric_updates.map( ( { value } ) => value ) ).toEqual( [ 40, 10 ] )
    expect( detail.outcome )
      .toMatchObject( { type: 'metric', unit: 'SGD', target: 100, latest: 40 } )
    expect( detail.checkins ).toEqual( [] )
  } )

  it( 'gives a check-in goal its ratings', async () => {
    const goal = await makeGoal( { outcome: 'checkin', checkin_cadence: 'weekly' } )

    insertCheckin( user.id, goal, { period_start: '2026-10-26', rating: 2 } )
    insertCheckin( user.id, goal, { period_start: '2026-11-02', rating: 5, note: 'good' } )

    const detail = GetThemisGoalResponse.parse(
      ( await agent.get( `/api/themis/goals/${ goal }` ) ).body,
    )

    expect( detail.checkins.map( ( { rating } ) => rating ) ).toEqual( [ 5, 2 ] )
    expect( detail.outcome ).toMatchObject( { type: 'checkin', cadence: 'weekly' } )
  } )

  it( 'lists the linked subjects and pools their learning', async () => {
    const goal = await makeGoal()
    const { subject } = makeSubject( 'Learning/Alpha', [ 'A' ] )

    await agent.put( `/api/themis/goals/${ goal }/subjects` ).send( { subject_ids: [ subject ] } )

    const detail = GetThemisGoalResponse.parse(
      ( await agent.get( `/api/themis/goals/${ goal }` ) ).body,
    )

    expect( detail.subjects ).toEqual( [ { id: subject, name: 'Alpha' } ] )
    expect( detail.outcome ).toEqual( {
      type: 'learning',
      coverage: 0,
      mastery: 0,
      concept_count: 1,
    } )
  } )

  it( 'gives twelve weeks of time, oldest first, ending with this week', async () => {
    const goal = await makeGoal()
    const detail = GetThemisGoalResponse.parse(
      ( await agent.get( `/api/themis/goals/${ goal }` ) ).body,
    )

    expect( detail.time_by_week ).toHaveLength( 12 )
    expect( detail.time_by_week[ 0 ]?.week_start ).toBe( '2026-08-24' )
    expect( detail.time_by_week[ 11 ] ).toEqual( {
      week_start: '2026-11-09',
      measured: 0,
      logged: 0,
    } )
  } )

  it( 'answers 404 for an unknown goal and for another user\'s', async () => {
    const goal = await makeGoal()
    const other = signedInRequest( app, createTestUser( { modules: [ 'themis' ] } ) )

    expect( ( await other.get( `/api/themis/goals/${ goal }` ) ).status ).toBe( 404 )
    expect( ( await agent.get( `/api/themis/goals/${ crypto.randomUUID() }` ) ).status )
      .toBe( 404 )
  } )
} )

describe( 'GET /api/themis/overview', () => {
  const overview = async ( query = '' ): Promise< GetThemisOverviewResponse > => {
    const response = await agent.get( `/api/themis/overview${ query }` )

    expect( response.status ).toBe( 200 )

    return GetThemisOverviewResponse.parse( response.body )
  }

  it( 'answers the current week by default, and a month or quarter on request', async () => {
    expect( await overview() ).toMatchObject( {
      period: 'week',
      from: '2026-11-09',
      to: '2026-11-15',
    } )
    expect( await overview( '?period=month' ) ).toMatchObject( {
      period: 'month',
      from: '2026-11-01',
      to: '2026-11-30',
    } )
    expect( await overview( '?period=quarter' ) ).toMatchObject( {
      period: 'quarter',
      from: '2026-10-01',
      to: '2026-12-31',
    } )
  } )

  it( 'refuses an unknown period with 400', async () => {
    expect( ( await agent.get( '/api/themis/overview?period=year' ) ).status ).toBe( 400 )
  } )

  it( 'lists the areas in order with their active goals only', async () => {
    const second = await makeArea( 'Financial' )
    const kept = await makeGoal( { outcome: 'learning' }, 'Kept' )
    const done = await makeGoal( { outcome: 'learning' }, 'Done' )
    const dropped = await makeGoal( { outcome: 'learning' }, 'Dropped' )

    await makeGoal( { outcome: 'metric', metric_target: 5 }, 'Fund', second )
    await agent.patch( `/api/themis/goals/${ done }` ).send( { status: 'achieved' } )
    await agent.patch( `/api/themis/goals/${ dropped }` ).send( { status: 'dropped' } )

    const { areas } = await overview()

    expect( areas.map( ( { name } ) => name ) ).toEqual( [ 'Career', 'Financial' ] )
    expect( areas[ 0 ]?.goals.map( ( { goal } ) => goal.id ) ).toEqual( [ kept ] )
    expect( areas[ 1 ]?.goals ).toHaveLength( 1 )
  } )

  it( 'keeps an area with no active goals', async () => {
    const { areas } = await overview()

    expect( areas ).toHaveLength( 1 )
    expect( areas[ 0 ]?.goals ).toEqual( [] )
  } )

  it( 'lists the check-ins due for active check-in goals', async () => {
    const due = await makeGoal( { outcome: 'checkin', checkin_cadence: 'weekly' }, 'Family' )
    const answered = await makeGoal( { outcome: 'checkin', checkin_cadence: 'weekly' }, 'Rest' )
    const fresh = await makeGoal( { outcome: 'checkin', checkin_cadence: 'monthly' }, 'New' )

    backdate( due, '2026-10-01T00:00:00.000Z' )
    backdate( answered, '2026-10-01T00:00:00.000Z' )
    insertCheckin( user.id, answered, { period_start: '2026-11-02', rating: 3 } )
    backdate( fresh, '2026-11-10T00:00:00.000Z' )

    expect( ( await overview() ).checkins_due ).toEqual( [ {
      goal_id: due,
      goal_name: 'Family',
      area_id: area,
      area_name: 'Career',
      cadence: 'weekly',
      period_start: '2026-11-02',
      period_end: '2026-11-08',
    } ] )
  } )

  it( 'shows a metric goal\'s latest value, target, unit and last 8 updates', async () => {
    const goal = await makeGoal(
      { outcome: 'metric', metric_unit: 'SGD', metric_target: 30000 },
      'Fund',
    )

    for( let day = 1; day <= 10; day++ ) {
      insertMetricUpdate( user.id, goal, {
        value: day * 1000,
        at: `2026-11-${ String( day ).padStart( 2, '0' ) }T00:00:00.000Z`,
      } )
    }

    const outcome = ( await overview() ).areas[ 0 ]?.goals[ 0 ]?.outcome

    expect( outcome ).toMatchObject( { type: 'metric', unit: 'SGD', target: 30000, latest: 10000 } )
    expect( outcome?.type === 'metric' && outcome.updates.map( ( { value } ) => value ) )
      .toEqual( [ 10, 9, 8, 7, 6, 5, 4, 3 ].map( ( value ) => value * 1000 ) )
  } )

  it( 'shows a metric goal with no update as having no latest value', async () => {
    await makeGoal( { outcome: 'metric', metric_target: 5 } )

    expect( ( await overview() ).areas[ 0 ]?.goals[ 0 ]?.outcome )
      .toMatchObject( { type: 'metric', latest: null, unit: null, updates: [] } )
  } )

  it( 'shows a check-in goal\'s last 8 ratings', async () => {
    const goal = await makeGoal( { outcome: 'checkin', checkin_cadence: 'weekly' } )

    for( let week = 0; week < 10; week++ ) {
      insertCheckin( user.id, goal, {
        period_start: `2026-0${ 1 + Math.floor( week / 4 ) }-${ 10 + ( week % 4 ) * 7 }`,
        rating: 1 + ( week % 5 ),
      } )
    }

    const outcome = ( await overview() ).areas[ 0 ]?.goals[ 0 ]?.outcome

    expect( outcome?.type === 'checkin' && outcome.ratings ).toHaveLength( 8 )
  } )

  it( 'pools coverage and mastery over every concept of the linked approved subjects', async () => {
    const goal = await makeGoal( { outcome: 'learning' } )
    const a = makeSubject( 'Learning/Alpha', [ 'A1', 'A2' ] )
    const b = makeSubject( 'Learning/Beta', [ 'B1' ] )
    const draft = makeSubject( 'Learning/Draft', [ 'D1', 'D2', 'D3' ], 'draft' )
    const note = addNote( user.id, a.subject )

    setNoteConcepts( user.id, note, [ a.concepts[ 0 ] ?? '' ], 'claude' )
    addQuestion( user.id, note, {
      conceptId: a.concepts[ 0 ] ?? '',
      reps: 3,
      stability: 21,
    } )
    await agent.put( `/api/themis/goals/${ goal }/subjects` )
      .send( { subject_ids: [ a.subject, b.subject, draft.subject ] } )

    const card = ( await overview() ).areas[ 0 ]?.goals[ 0 ]

    // Three concepts in all: one covered and fully known, so 1/3 and 1/3 (not the mean of the
    // subjects' own numbers, which would be 0.25)
    expect( card?.outcome ).toEqual( {
      type: 'learning',
      coverage: 1 / 3,
      mastery: 1 / 3,
      concept_count: 3,
    } )
    expect( card?.subjects.map( ( { name } ) => name ) ).toEqual( [ 'Alpha', 'Beta', 'Draft' ] )
  } )

  it( 'shows a learning goal with no approved subject as having nothing to average', async () => {
    await makeGoal( { outcome: 'learning' } )

    expect( ( await overview() ).areas[ 0 ]?.goals[ 0 ]?.outcome )
      .toEqual( { type: 'learning', coverage: null, mastery: null, concept_count: 0 } )
  } )

  it( 'has no time until time is recorded', async () => {
    await makeGoal()

    const { areas } = await overview()

    expect( areas[ 0 ]?.time ).toEqual( { seconds: 0, measured: 0, logged: 0 } )
    expect( areas[ 0 ]?.goals[ 0 ]?.time ).toEqual( { seconds: 0, measured: 0, logged: 0 } )
  } )

  it( 'shows each user only their own areas and goals', async () => {
    await makeGoal()

    const other = signedInRequest( app, createTestUser( { modules: [ 'themis' ] } ) )
    const response = await other.get( '/api/themis/overview' )

    expect( GetThemisOverviewResponse.parse( response.body ).areas ).toEqual( [] )
  } )
} )

describe( 'time in the overview and a goal\'s detail', () => {
  const measured = ( subject: string, day: string, seconds: number ): void => {
    insertMeasuredEntry( user.id, subject, {
      started_at: `${ day }T01:00:00.000Z`,
      ended_at: `${ day }T01:00:00.000Z`,
      day,
      seconds,
    } )
  }

  const logged = (
    target: { subject_id: string } | { goal_id: string },
    day: string,
    seconds: number,
  ): void => {
    insertLoggedEntry( user.id, {
      subject_id: null,
      goal_id: null,
      note: null,
      ...target,
      day,
      seconds,
    } )
  }

  const overview = async ( query = '' ): Promise< GetThemisOverviewResponse > => {
    return GetThemisOverviewResponse.parse(
      ( await agent.get( `/api/themis/overview${ query }` ) ).body,
    )
  }

  // Career has `first` (linked to `linkedSubject`) and an achieved goal; Financial has `second`
  const setup = async () => {
    const financial = await makeArea( 'Financial' )
    const first = await makeGoal( { outcome: 'learning' }, 'First' )
    const second = await makeGoal( { outcome: 'learning' }, 'Second', financial )
    const linkedSubject = addSubject( user.id, 'Learning/Linked' )
    const unlinked = addSubject( user.id, 'Learning/Unlinked' )

    await agent.put( `/api/themis/goals/${ first }/subjects` )
      .send( { subject_ids: [ linkedSubject ] } )

    return { first, second, linkedSubject, unlinked }
  }

  it( 'gives a goal its own logged time plus all the time of its linked subjects', async () => {
    const { first, linkedSubject, unlinked } = await setup()

    measured( linkedSubject, '2026-11-10', 100 )
    logged( { subject_id: linkedSubject }, '2026-11-11', 200 )
    logged( { goal_id: first }, '2026-11-11', 400 )
    measured( unlinked, '2026-11-10', 1600 )

    const { areas } = await overview()

    expect( areas[ 0 ]?.goals[ 0 ]?.time ).toEqual( { seconds: 700, measured: 100, logged: 600 } )
    expect( areas[ 1 ]?.goals[ 0 ]?.time ).toEqual( { seconds: 0, measured: 0, logged: 0 } )
  } )

  it( 'gives an area the sum of its active goals, and leaves unlinked subjects out', async () => {
    const { first, linkedSubject, unlinked } = await setup()
    const achieved = await makeGoal( { outcome: 'learning' }, 'Done' )

    await agent.patch( `/api/themis/goals/${ achieved }` ).send( { status: 'achieved' } )
    logged( { goal_id: first }, '2026-11-10', 300 )
    measured( linkedSubject, '2026-11-10', 100 )
    logged( { goal_id: achieved }, '2026-11-10', 5000 )
    measured( unlinked, '2026-11-10', 1600 )

    const { areas } = await overview()

    expect( areas[ 0 ]?.time ).toEqual( { seconds: 400, measured: 100, logged: 300 } )
    expect( areas[ 1 ]?.time ).toEqual( { seconds: 0, measured: 0, logged: 0 } )
  } )

  it( 'picks the entries of the week, month or quarter, edges included', async () => {
    const { first } = await setup()

    for( const [ day, seconds ] of [
      [ '2026-09-30', 1 ],
      [ '2026-10-01', 10 ],
      [ '2026-10-31', 100 ],
      [ '2026-11-01', 1000 ],
      [ '2026-11-08', 10_000 ],
      [ '2026-11-09', 100_000 ],
      [ '2026-11-15', 1_000_000 ],
      [ '2026-11-16', 10_000_000 ],
      [ '2026-11-30', 100_000_000 ],
    ] as const ) {
      logged( { goal_id: first }, day, seconds )
    }

    const seconds = async ( query: string ): Promise< number | undefined > => {
      return ( await overview( query ) ).areas[ 0 ]?.goals[ 0 ]?.time.seconds
    }

    expect( await seconds( '?period=week' ) ).toBe( 1_100_000 )
    expect( await seconds( '?period=month' ) ).toBe( 111_111_000 )
    expect( await seconds( '?period=quarter' ) ).toBe( 111_111_110 )
  } )

  it( 'moves a subject\'s past time with it when it is relinked', async () => {
    const { first, second, linkedSubject } = await setup()

    measured( linkedSubject, '2026-11-10', 100 )
    await agent.put( `/api/themis/goals/${ second }/subjects` )
      .send( { subject_ids: [ linkedSubject ] } )

    const { areas } = await overview()

    expect( areas[ 0 ]?.goals[ 0 ]?.goal.id ).toBe( first )
    expect( areas[ 0 ]?.goals[ 0 ]?.time.seconds ).toBe( 0 )
    expect( areas[ 1 ]?.goals[ 0 ]?.time.seconds ).toBe( 100 )
  } )

  it( 'gives a goal\'s detail twelve weeks of measured and logged time', async () => {
    const { first, linkedSubject } = await setup()

    measured( linkedSubject, '2026-11-10', 100 )
    logged( { goal_id: first }, '2026-11-11', 400 )
    logged( { goal_id: first }, '2026-11-03', 60 )
    logged( { goal_id: first }, '2026-08-24', 5 )
    logged( { goal_id: first }, '2026-08-23', 7000 )

    const detail = GetThemisGoalResponse.parse(
      ( await agent.get( `/api/themis/goals/${ first }` ) ).body,
    )
    const week = ( start: string ) => detail.time_by_week
      .find( ( { week_start: at } ) => at === start )

    expect( detail.time_by_week ).toHaveLength( 12 )
    expect( week( '2026-11-09' ) )
      .toEqual( { week_start: '2026-11-09', measured: 100, logged: 400 } )
    expect( week( '2026-11-02' ) ).toEqual( { week_start: '2026-11-02', measured: 0, logged: 60 } )
    expect( week( '2026-08-24' ) ).toEqual( { week_start: '2026-08-24', measured: 0, logged: 5 } )
    expect( detail.time_by_week.reduce( ( sum, { logged: value } ) => sum + value, 0 ) ).toBe( 465 )
  } )
} )

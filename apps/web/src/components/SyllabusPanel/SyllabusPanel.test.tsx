// Testing Library
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { useMeleteSyllabus } from '#src/hooks/useMeleteSyllabus'
import { useUpdateSubject } from '#src/hooks/useMeleteMutations'
import {
  useApproveSyllabus,
  useDraftSyllabus,
  useSaveSyllabus,
} from '#src/hooks/useSyllabusMutations'
import { meleteSubjectFixture, SUBJECT_ID } from '#src/test-support/melete.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { DIFF, syllabusFixture } from '#src/test-support/syllabus.fixture'
import { SyllabusPanel } from './SyllabusPanel'

vi.mock( '#src/hooks/useMeleteSyllabus' )
vi.mock( '#src/hooks/useMeleteMutations' )
vi.mock( '#src/hooks/useSyllabusMutations' )

const mocks = {
  update: vi.fn(),
  draft: vi.fn(),
  approve: vi.fn(),
  save: vi.fn(),
}

const show = ( syllabus = syllabusFixture(), overrides = {} ): void => {
  vi.mocked( useMeleteSyllabus ).mockReturnValue( {
    syllabus,
    isLoading: false,
    error: null,
    ...overrides,
  } )
}

const setup = ( subject = meleteSubjectFixture(), stubs: { save?: object } = {} ) => {
  vi.mocked( useSaveSyllabus ).mockReturnValue(
    mutationStub( { mutate: mocks.save, ...stubs.save } ),
  )
  renderWithClient( <SyllabusPanel subject={ subject } /> )

  return userEvent.setup()
}

beforeEach( () => {
  Object.values( mocks ).forEach( ( mock ) => mock.mockReset() )
  mocks.update.mockResolvedValue( undefined )
  vi.mocked( useUpdateSubject ).mockReturnValue( mutationStub( { mutateAsync: mocks.update } ) )
  vi.mocked( useDraftSyllabus ).mockReturnValue( mutationStub( { mutate: mocks.draft } ) )
  vi.mocked( useApproveSyllabus ).mockReturnValue( mutationStub( { mutate: mocks.approve } ) )
  show()
} )

describe( 'SyllabusPanel, before a draft', () => {
  it( 'shows the setup for a subject with no syllabus', () => {
    setup()

    expect( screen.getByRole( 'button', { name: 'Draft syllabus' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Approve' } ) ).not.toBeInTheDocument()
  } )

  it( 'saves the level and intent on the subject, then asks for the draft', async () => {
    const user = setup()

    await user.click( screen.getByRole( 'radio', { name: /Working knowledge/ } ) )
    await user.type( screen.getByRole( 'textbox', { name: /Intent/ } ), 'Pass the exam' )
    await user.click( screen.getByRole( 'button', { name: 'Draft syllabus' } ) )

    expect( mocks.update ).toHaveBeenCalledWith( {
      id: SUBJECT_ID,
      body: { target_level: 'working', intent: 'Pass the exam' },
    } )
    await waitFor( () => expect( mocks.draft ).toHaveBeenCalledWith( SUBJECT_ID ) )
  } )

  it( 'only asks for the draft when the level and intent are as they were', async () => {
    const user = setup( meleteSubjectFixture( {
      target_level: 'expert',
      intent: 'Ship it',
      syllabus_status: 'failed',
      syllabus_error: 'Cut off',
    } ) )

    await user.click( screen.getByRole( 'button', { name: 'Draft syllabus' } ) )

    expect( mocks.update ).not.toHaveBeenCalled()
    await waitFor( () => expect( mocks.draft ).toHaveBeenCalledWith( SUBJECT_ID ) )
  } )

  it( 'does not ask for a draft when saving the level fails', async () => {
    mocks.update.mockRejectedValue( new Error( 'Could not save' ) )

    const user = setup()

    await user.click( screen.getByRole( 'radio', { name: /Expert/ } ) )
    await user.click( screen.getByRole( 'button', { name: 'Draft syllabus' } ) )

    await waitFor( () => expect( mocks.update ).toHaveBeenCalled() )
    expect( mocks.draft ).not.toHaveBeenCalled()
  } )

  it( 'shows progress while the draft is being made, without the editor', () => {
    setup( meleteSubjectFixture( { target_level: 'working', syllabus_status: 'drafting' } ) )

    expect( screen.getByRole( 'status' ).textContent ).toContain( 'Drafting the syllabus' )
    expect( screen.queryByRole( 'button', { name: 'Draft syllabus' } ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'button', { name: 'Approve' } ) ).not.toBeInTheDocument()
  } )
} )

describe( 'SyllabusPanel, with a syllabus', () => {
  const drafted = meleteSubjectFixture( { target_level: 'working', syllabus_status: 'draft' } )

  it( 'shows the editor for a draft and approves it', async () => {
    const user = setup( drafted )

    expect( screen.getAllByRole( 'textbox', { name: 'Concept name' } ) ).toHaveLength( 3 )

    await user.click( screen.getByRole( 'button', { name: 'Approve' } ) )

    expect( mocks.approve ).toHaveBeenCalledWith( SUBJECT_ID )
  } )

  it( 'saves an edit', async () => {
    const user = setup( drafted )

    await user.click( screen.getByRole( 'button', { name: 'Remove Windows' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Remove section Advanced' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Save changes' } ) )

    expect( mocks.save ).toHaveBeenCalledWith( {
      id: SUBJECT_ID,
      edit: { sections: [ expect.objectContaining( { name: 'Basics' } ) as unknown ] },
    } )
  } )

  it( 'tells what the last save changed', () => {
    setup( drafted, { save: { data: { syllabus: syllabusFixture(), diff: DIFF } } } )

    expect( screen.getByRole( 'status' ).textContent ).toContain( 'Saved: 1 renamed' )
  } )

  it( 'shows an approved syllabus and redrafts it after a confirm', async () => {
    const user = setup(
      meleteSubjectFixture( { target_level: 'working', syllabus_status: 'approved' } ),
    )

    expect( screen.getByText( 'Approved' ) ).toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Redraft' } ) )
    await user.click( screen.getAllByRole( 'button', { name: 'Redraft' } ).at( -1 ) as HTMLElement )

    expect( mocks.draft ).toHaveBeenCalledWith( SUBJECT_ID )
  } )

  it( 'shows an error from saving, approving or drafting', () => {
    vi.mocked( useApproveSyllabus ).mockReturnValue(
      mutationStub( { isError: true, error: new Error( 'The syllabus has no concepts' ) } ),
    )
    setup( drafted )

    expect( screen.getByRole( 'alert' ).textContent ).toContain( 'The syllabus has no concepts' )
  } )

  it( 'waits for the syllabus to load, and reports a load error', () => {
    show( syllabusFixture(), { syllabus: null, isLoading: true } )
    setup( drafted )

    expect( screen.getByRole( 'status' ).textContent ).toContain( 'Loading the syllabus' )
  } )

  it( 'reports a load error', () => {
    show( syllabusFixture(), { syllabus: null, error: 'Server down' } )
    setup( drafted )

    expect( screen.getByRole( 'alert' ).textContent ).toContain( 'Server down' )
  } )
} )

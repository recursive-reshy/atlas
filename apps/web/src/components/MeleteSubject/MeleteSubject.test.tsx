// Testing Library
import { screen } from '@testing-library/react'
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
import {
  useEnrollSubject,
  useRetryGeneration,
  useSetNoteEnrolled,
  useUpdateSubject,
} from '#src/hooks/useMeleteMutations'
import { useMeleteSubject } from '#src/hooks/useMeleteSubject'
import { useMeleteSyllabus } from '#src/hooks/useMeleteSyllabus'
import { useOffSyllabusAction } from '#src/hooks/useNoteMappingMutations'
import { SyllabusPanel } from '#src/components/SyllabusPanel'
import {
  meleteNoteFixture,
  meleteSubjectFixture,
  NOTE_ID,
  SUBJECT_ID,
} from '#src/test-support/melete.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { MeleteSubject } from './MeleteSubject'

vi.mock( '#src/hooks/useMeleteSubject' )
vi.mock( '#src/hooks/useMeleteSyllabus' )
vi.mock( '#src/hooks/useNoteMappingMutations' )
vi.mock( '#src/hooks/useMeleteMutations' )
vi.mock( '#src/components/SubjectOverview', () => ( {
  SubjectOverview: vi.fn( ( { subjectId }: { subjectId: string } ) => (
    <p>{ `The overview of ${ subjectId }` }</p>
  ) ),
} ) )
vi.mock( '#src/components/LogTimeButton', () => ( {
  LogTimeButton: ( { subjectId }: { subjectId?: string } ) => (
    <p>{ `log time for ${ subjectId }` }</p>
  ),
} ) )
vi.mock( '#src/components/SyllabusPanel', () => ( {
  SyllabusPanel: vi.fn( () => <p>The syllabus panel</p> ),
} ) )

const mocks = {
  subject: vi.mocked( useMeleteSubject ),
  enroll: vi.fn(),
  update: vi.fn(),
  setNote: vi.fn(),
  retry: vi.fn(),
  offSyllabus: vi.fn(),
  syllabus: vi.mocked( useMeleteSyllabus ),
}

const show = ( overrides = {} ): void => {
  mocks.subject.mockReturnValue( {
    subject: meleteSubjectFixture(),
    notes: [ meleteNoteFixture() ],
    isLoading: false,
    error: null,
    ...overrides,
  } )
}

const renderPage = ( tab?: string ) => {
  const view = renderWithClient( <MeleteSubject />, {
    route: `/melete/subjects/${ SUBJECT_ID }${ tab === undefined ? '' : `?tab=${ tab }` }`,
    path: '/melete/subjects/:subjectId',
  } )

  return Object.assign( userEvent.setup(), { location: view.location } )
}

beforeEach( () => {
  Object.values( mocks ).forEach( ( mock ) => mock.mockReset() )
  vi.mocked( useEnrollSubject ).mockReturnValue( mutationStub( { mutate: mocks.enroll } ) )
  vi.mocked( useUpdateSubject ).mockReturnValue( mutationStub( { mutate: mocks.update } ) )
  vi.mocked( useSetNoteEnrolled ).mockReturnValue( mutationStub( { mutate: mocks.setNote } ) )
  vi.mocked( useRetryGeneration ).mockReturnValue( mutationStub( { mutate: mocks.retry } ) )
  vi.mocked( useOffSyllabusAction )
    .mockReturnValue( mutationStub( { mutate: mocks.offSyllabus } ) )
  mocks.syllabus.mockReturnValue( { syllabus: null, isLoading: false, error: null } )
  show()
} )

describe( 'MeleteSubject', () => {
  it( 'loads the subject from the URL and shows its name and counts', () => {
    renderPage()

    expect( mocks.subject ).toHaveBeenCalledWith( SUBJECT_ID )
    expect( screen.getByRole( 'heading', { name: 'TypeScript' } ) ).toBeInTheDocument()
    expect( screen.getByText( '8 notes · 3 enrolled · 4 due' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Today' } ) ).toHaveAttribute( 'href', '/melete' )
  } )

  it( 'enrolls and unenrolls every note', async () => {
    const user = renderPage( 'settings' )

    await user.click( screen.getByRole( 'button', { name: 'Enroll all' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Unenroll all' } ) )

    expect( mocks.enroll ).toHaveBeenNthCalledWith( 1, { id: SUBJECT_ID, enrolled: true } )
    expect( mocks.enroll ).toHaveBeenNthCalledWith( 2, { id: SUBJECT_ID, enrolled: false } )
  } )

  it( 'updates the subject settings', async () => {
    const user = renderPage( 'settings' )

    await user.click( screen.getByRole( 'switch', { name: 'Auto-enroll new notes' } ) )

    expect( mocks.update ).toHaveBeenCalledWith( { id: SUBJECT_ID, body: { auto_enroll: true } } )
  } )

  it( 'enrolls one note and retries a failed one', async () => {
    show( { notes: [ meleteNoteFixture( { enrolled: false, generation: 'failed' } ) ] } )
    const user = renderPage( 'notes' )

    await user.click( screen.getByRole( 'switch', { name: 'Generics' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Retry' } ) )

    expect( mocks.setNote ).toHaveBeenCalledWith( { id: NOTE_ID, enrolled: true } )
    expect( mocks.retry ).toHaveBeenCalledWith( NOTE_ID )
  } )

  it( 'reads the syllabus only for an approved subject, to name each note\'s concepts', () => {
    show( { subject: meleteSubjectFixture( { syllabus_status: 'approved' } ) } )
    renderPage( 'notes' )

    expect( mocks.syllabus ).toHaveBeenCalledWith( SUBJECT_ID, true )
  } )

  it( 'does not read the syllabus of an unapproved subject', () => {
    renderPage( 'notes' )

    expect( mocks.syllabus ).toHaveBeenCalledWith( SUBJECT_ID, false )
  } )

  it( 'dismisses a note\'s off-syllabus flag and adds its concept to a section', async () => {
    show( {
      subject: meleteSubjectFixture( { syllabus_status: 'approved' } ),
      notes: [ meleteNoteFixture( {
        off_syllabus: 'flagged',
        off_syllabus_suggestion: 'Decorators',
      } ) ],
    } )
    mocks.syllabus.mockReturnValue( {
      syllabus: { sections: [ {
        id: '1a2b3c4d-0000-4000-8000-000000000001',
        name: 'Basics',
        concepts: [],
      } ] },
      isLoading: false,
      error: null,
    } )

    const user = renderPage( 'notes' )

    await user.click( screen.getByRole( 'button', { name: 'Dismiss' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Add concept' } ) )

    expect( mocks.offSyllabus ).toHaveBeenNthCalledWith(
      1,
      { id: NOTE_ID, body: { action: 'dismiss' } },
    )
    expect( mocks.offSyllabus ).toHaveBeenNthCalledWith( 2, {
      id: NOTE_ID,
      body: { action: 'add_concept', section_id: '1a2b3c4d-0000-4000-8000-000000000001' },
    } )
  } )

  it( 'says so when the subject has no notes', () => {
    show( { notes: [] } )
    renderPage( 'notes' )

    expect( screen.getByText( 'No notes in this folder yet.' ) ).toBeInTheDocument()
  } )

  it( 'shows a status while loading', () => {
    show( { subject: null, notes: [], isLoading: true } )
    renderPage()

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading' )
  } )

  it( 'shows the server\'s message, such as a missing learning root', () => {
    show( { subject: null, notes: [], error: 'Choose a learning root first' } )
    renderPage()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Choose a learning root first' )
  } )

  it( 'shows the message of a failed change', () => {
    vi.mocked( useEnrollSubject ).mockReturnValue(
      mutationStub( { isError: true, error: new Error( 'Subject not found' ) } ),
    )
    renderPage()

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Subject not found' )
  } )

  describe( 'the tabs', () => {
    it( 'lists Overview, Syllabus, Notes and Settings, and opens on Overview', () => {
      renderPage()

      expect( screen.getAllByRole( 'tab' ).map( ( tab ) => tab.textContent ) )
        .toEqual( [ 'Overview', 'Syllabus', 'Notes', 'Settings' ] )
      expect( screen.getByRole( 'tab', { name: 'Overview' } ) ).toHaveAttribute(
        'aria-selected',
        'true',
      )
    } )

    it( 'keeps the heading and counts above every tab', () => {
      renderPage( 'notes' )

      expect( screen.getByRole( 'heading', { name: 'TypeScript' } ) ).toBeInTheDocument()
      expect( screen.getByText( '8 notes · 3 enrolled · 4 due' ) ).toBeInTheDocument()
    } )

    it( 'opens a tab from the address', () => {
      renderPage( 'settings' )

      expect( screen.getByRole( 'tab', { name: 'Settings' } ) ).toHaveAttribute(
        'aria-selected',
        'true',
      )
    } )

    it( 'falls back to Overview for a tab it does not know', () => {
      renderPage( 'nonsense' )

      expect( screen.getByRole( 'tab', { name: 'Overview' } ) ).toHaveAttribute(
        'aria-selected',
        'true',
      )
    } )

    it( 'puts the chosen tab in the address, so it survives a reload', async () => {
      const user = renderPage()

      await user.click( screen.getByRole( 'tab', { name: 'Notes' } ) )

      expect( user.location().search ).toBe( '?tab=notes' )
      expect( screen.getByRole( 'tab', { name: 'Notes' } ) ).toHaveAttribute(
        'aria-selected',
        'true',
      )
    } )

    it( 'shows only the open tab\'s content', async () => {
      const user = renderPage( 'notes' )

      expect( screen.getByRole( 'switch', { name: 'Generics' } ) ).toBeInTheDocument()
      expect( screen.queryByRole( 'button', { name: 'Enroll all' } ) ).not.toBeInTheDocument()

      await user.click( screen.getByRole( 'tab', { name: 'Settings' } ) )

      expect( screen.getByRole( 'button', { name: 'Enroll all' } ) ).toBeInTheDocument()
      expect( screen.queryByRole( 'switch', { name: 'Generics' } ) ).not.toBeInTheDocument()
    } )

    it( 'shows the syllabus panel for the subject on the Syllabus tab', () => {
      renderPage( 'syllabus' )

      expect( screen.getByText( 'The syllabus panel' ) ).toBeInTheDocument()
      expect( vi.mocked( SyllabusPanel ).mock.calls[ 0 ][ 0 ].subject ).toEqual(
        meleteSubjectFixture(),
      )
    } )
  } )

  describe( 'the Overview tab', () => {
    it( 'asks for a syllabus to be set up, and opens the Syllabus tab to do it', async () => {
      const user = renderPage()

      expect( screen.getByText( /Set up a syllabus/ ) ).toBeInTheDocument()

      await user.click( screen.getByRole( 'button', { name: 'Set up syllabus' } ) )

      expect( user.location().search ).toBe( '?tab=syllabus' )
    } )

    it( 'shows the gap view of an approved subject in place of the pointer', () => {
      show( { subject: meleteSubjectFixture( { syllabus_status: 'approved' } ) } )
      renderPage()

      expect( screen.getByText( `The overview of ${ SUBJECT_ID }` ) ).toBeInTheDocument()
      expect( screen.queryByRole( 'button', { name: 'Set up syllabus' } ) )
        .not.toBeInTheDocument()
    } )
  } )

  it( 'offers Log time for this subject above the tabs', () => {
    renderPage()

    expect( screen.getByText( `log time for ${ SUBJECT_ID }` ) ).toBeInTheDocument()
  } )
} )

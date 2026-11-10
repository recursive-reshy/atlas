// Testing Library
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { meleteSubjectFixture } from '#src/features/melete/fixtures/melete.fixture'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { SyllabusSetup } from './SyllabusSetup'

const setup = ( overrides = {}, subject = meleteSubjectFixture() ) => {
  const onDraft = vi.fn()

  renderWithClient(
    <SyllabusSetup subject={ subject } isBusy={ false } onDraft={ onDraft } { ...overrides } />,
  )

  return { onDraft, user: userEvent.setup() }
}

describe( 'SyllabusSetup', () => {
  it( 'offers the four levels, each with a line that explains it', () => {
    setup()

    const levels = screen.getAllByRole( 'radio' )

    expect( levels.map( ( level ) => level.getAttribute( 'value' ) ) )
      .toEqual( [ 'awareness', 'working', 'proficient', 'expert' ] )
    expect( screen.getByRole( 'radio', { name: /Awareness/ } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'radio', { name: /Working knowledge/ } ) ).toBeInTheDocument()
    expect( screen.getByText( /Know the terms/ ) ).toBeInTheDocument()
  } )

  it( 'keeps Draft syllabus off until a level is chosen', async () => {
    const { user, onDraft } = setup()
    const draft = screen.getByRole( 'button', { name: 'Draft syllabus' } )

    expect( draft ).toBeDisabled()

    await user.click( screen.getByRole( 'radio', { name: /Proficient/ } ) )

    expect( draft ).toBeEnabled()
    expect( onDraft ).not.toHaveBeenCalled()
  } )

  it( 'drafts with the chosen level and the intent', async () => {
    const { user, onDraft } = setup()

    await user.click( screen.getByRole( 'radio', { name: /Working knowledge/ } ) )
    await user.type( screen.getByRole( 'textbox', { name: /Intent/ } ), 'Pass the exam' )
    await user.click( screen.getByRole( 'button', { name: 'Draft syllabus' } ) )

    expect( onDraft ).toHaveBeenCalledWith( { target_level: 'working', intent: 'Pass the exam' } )
  } )

  it( 'drafts with no intent when the field is blank', async () => {
    const { user, onDraft } = setup()

    await user.click( screen.getByRole( 'radio', { name: /Expert/ } ) )
    await user.click( screen.getByRole( 'button', { name: 'Draft syllabus' } ) )

    expect( onDraft ).toHaveBeenCalledWith( { target_level: 'expert', intent: null } )
  } )

  it( 'starts from the level and intent the subject already has', () => {
    setup( {}, meleteSubjectFixture( { target_level: 'proficient', intent: 'Ship it' } ) )

    expect( screen.getByRole( 'radio', { name: /Proficient/ } ) ).toBeChecked()
    expect( screen.getByRole( 'textbox', { name: /Intent/ } ) ).toHaveValue( 'Ship it' )
    expect( screen.getByRole( 'button', { name: 'Draft syllabus' } ) ).toBeEnabled()
  } )

  it( 'limits the intent to 500 characters', () => {
    setup()

    expect( screen.getByRole( 'textbox', { name: /Intent/ } ) )
      .toHaveAttribute( 'maxlength', '500' )
  } )

  it( 'shows why the last draft failed and lets the person try again', () => {
    setup( {}, meleteSubjectFixture( {
      target_level: 'working',
      syllabus_status: 'failed',
      syllabus_error: 'Syllabus drafting was cut off',
    } ) )

    expect( screen.getByRole( 'alert' ).textContent ).toContain( 'Syllabus drafting was cut off' )
    expect( screen.getByRole( 'button', { name: 'Draft syllabus' } ) ).toBeEnabled()
  } )

  it( 'shows no alert before anything has failed', () => {
    setup()

    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
  } )

  it( 'keeps the button off while a request is in flight', () => {
    setup( { isBusy: true }, meleteSubjectFixture( { target_level: 'working' } ) )

    expect( screen.getByRole( 'button', { name: 'Draft syllabus' } ) ).toBeDisabled()
  } )
} )

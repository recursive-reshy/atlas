// Testing Library
import { screen, within } from '@testing-library/react'
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
import { useModels } from '#src/hooks/useModels'
import { useSettings } from '#src/hooks/useSettings'
import { modelsState, settingsState } from '#src/test-support/hookStates'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { settingsFixture } from '#src/test-support/summarizer.fixture'
import { MeleteSettings } from './MeleteSettings'

vi.mock( '#src/hooks/useSettings' )
vi.mock( '#src/hooks/useModels' )

const mutate = vi.fn()

const pick = async ( label: string, option: string ): Promise< void > => {
  const user = userEvent.setup()

  await user.click( screen.getByRole( 'combobox', { name: label } ) )
  await user.click(
    within( screen.getByRole( 'listbox' ) ).getByRole( 'option', { name: option } ),
  )
}

beforeEach( () => {
  mutate.mockReset()
  vi.mocked( useSettings ).mockReturnValue(
    settingsState( { updateSettings: mutationStub( { mutate } ) } ),
  )
  vi.mocked( useModels ).mockReturnValue( modelsState() )
} )

describe( 'MeleteSettings', () => {
  it( 'shows the saved question and grading models', () => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( {
      settings: {
        ...settingsFixture().settings,
        melete_question_model: 'claude-opus-5-5',
        melete_grading_model: 'claude-sonnet-5-5',
      },
    } ) )
    renderWithClient( <MeleteSettings /> )

    expect( screen.getByRole( 'combobox', { name: 'Question model' } ) )
      .toHaveTextContent( 'Claude Opus 5.5' )
    expect( screen.getByRole( 'combobox', { name: 'Grading model' } ) )
      .toHaveTextContent( 'Claude Sonnet 5.5' )
  } )

  it( 'saves a new question model', async () => {
    renderWithClient( <MeleteSettings /> )

    await pick( 'Question model', 'Claude Opus 5.5' )

    expect( mutate ).toHaveBeenCalledWith( { melete_question_model: 'claude-opus-5-5' } )
  } )

  it( 'saves a new grading model', async () => {
    renderWithClient( <MeleteSettings /> )

    await pick( 'Grading model', 'Claude Sonnet 5.5' )

    expect( mutate ).toHaveBeenCalledWith( { melete_grading_model: 'claude-sonnet-5-5' } )
  } )

  it( 'shows the saved syllabus, mapping and suggestion models', () => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( {
      settings: {
        ...settingsFixture().settings,
        melete_syllabus_model: 'claude-opus-5-5',
        melete_map_model: 'claude-sonnet-5-5',
        melete_suggest_model: 'claude-opus-5-5',
      },
    } ) )
    renderWithClient( <MeleteSettings /> )

    expect( screen.getByRole( 'combobox', { name: 'Syllabus model' } ) )
      .toHaveTextContent( 'Claude Opus 5.5' )
    expect( screen.getByRole( 'combobox', { name: 'Mapping model' } ) )
      .toHaveTextContent( 'Claude Sonnet 5.5' )
    expect( screen.getByRole( 'combobox', { name: 'Suggestion model' } ) )
      .toHaveTextContent( 'Claude Opus 5.5' )
  } )

  it.each( [
    [ 'Syllabus model', 'melete_syllabus_model', 'claude-opus-5-5', 'Claude Opus 5.5' ],
    [ 'Mapping model', 'melete_map_model', 'claude-opus-5-5', 'Claude Opus 5.5' ],
    [ 'Suggestion model', 'melete_suggest_model', 'claude-sonnet-5-5', 'Claude Sonnet 5.5' ],
  ] )( 'saves a new %s', async ( label, key, id, name ) => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( {
      settings: { ...settingsFixture().settings, [ key ]: 'claude-haiku-5-5' },
      updateSettings: mutationStub( { mutate } ),
    } ) )
    renderWithClient( <MeleteSettings /> )

    await pick( label, name )

    expect( mutate ).toHaveBeenCalledWith( { [ key ]: id } )
  } )

  it( 'keeps a saved model that is not in the list selectable', () => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( {
      settings: { ...settingsFixture().settings, melete_question_model: 'claude-haiku-5-5' },
    } ) )
    renderWithClient( <MeleteSettings /> )

    expect( screen.getByRole( 'combobox', { name: 'Question model' } ) )
      .toHaveTextContent( 'claude-haiku-5-5' )
  } )

  it( 'says when the model list is offline', () => {
    vi.mocked( useModels ).mockReturnValue( modelsState( { source: 'fallback' } ) )
    renderWithClient( <MeleteSettings /> )

    expect( screen.getByText( /model list is offline/ ) ).toBeInTheDocument()
  } )

  it( 'shows a save error', () => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( {
      updateSettings: mutationStub( { isError: true, error: new Error( 'Unknown model' ) } ),
    } ) )
    renderWithClient( <MeleteSettings /> )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Unknown model' )
  } )

  describe( 'the mastery days', () => {
    const field = () => {
      return screen.getByRole( 'spinbutton', { name: 'Days until a question counts as known' } )
    }

    it( 'shows the saved number', () => {
      vi.mocked( useSettings ).mockReturnValue( settingsState( {
        settings: { ...settingsFixture().settings, melete_mastery_days: 30 },
      } ) )
      renderWithClient( <MeleteSettings /> )

      expect( field() ).toHaveValue( 30 )
    } )

    it( 'saves a new number when the field loses focus', async () => {
      const user = userEvent.setup()

      renderWithClient( <MeleteSettings /> )
      await user.clear( field() )
      await user.type( field(), '45' )
      await user.tab()

      expect( mutate ).toHaveBeenCalledWith( { melete_mastery_days: 45 } )
    } )

    it.each( [ '6', '91', '', '20.5' ] )( 'does not save "%s", and restores it', async ( text ) => {
      const user = userEvent.setup()

      renderWithClient( <MeleteSettings /> )
      await user.clear( field() )

      if( text !== '' ) {
        await user.type( field(), text )
      }

      await user.tab()

      expect( mutate ).not.toHaveBeenCalled()
      expect( field() ).toHaveValue( 21 )
    } )

    it( 'does not save an unchanged number', async () => {
      const user = userEvent.setup()

      renderWithClient( <MeleteSettings /> )
      await user.click( field() )
      await user.tab()

      expect( mutate ).not.toHaveBeenCalled()
    } )
  } )
} )

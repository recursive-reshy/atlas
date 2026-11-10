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
import type { GmailSourcesState } from '#src/features/gmail/hooks/useGmailSources'
import { SOURCE_ID, gmailSourceFixture } from '#src/features/gmail/fixtures/gmail.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { profilesFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { GmailDialogs } from './GmailDialogs'

vi.mock( '../AddGmailSourceDialog', () => ( {
  AddGmailSourceDialog: (
    { onSubmit, onCancel, isSubmitting, error }: {
      onSubmit: ( body: unknown ) => void
      onCancel: () => void
      isSubmitting: boolean
      error: string | null
    },
  ) => (
    <div>
      <p>{ `Add dialog ${ String( isSubmitting ) } ${ error ?? '' }` }</p>
      <button onClick={ () => onSubmit( { name: 'New' } ) }>submit add</button>
      <button onClick={ onCancel }>cancel add</button>
    </div>
  ),
} ) )
vi.mock( '../EditGmailSourceDialog', () => ( {
  EditGmailSourceDialog: (
    { source, onSubmit, isSubmitting, error }: {
      source: { name: string }
      onSubmit: ( body: unknown ) => void
      isSubmitting: boolean
      error: string | null
    },
  ) => (
    <div>
      <p>{ `Edit dialog ${ source.name } ${ String( isSubmitting ) } ${ error ?? '' }` }</p>
      <button onClick={ () => onSubmit( { enabled: false } ) }>submit edit</button>
    </div>
  ),
} ) )
vi.mock( '../DeleteGmailSourceDialog', () => ( {
  DeleteGmailSourceDialog: (
    { source, onConfirm, isDeleting, error }: {
      source: { name: string }
      onConfirm: ( removeItems: boolean ) => void
      isDeleting: boolean
      error: string | null
    },
  ) => (
    <div>
      <p>{ `Delete dialog ${ source.name } ${ String( isDeleting ) } ${ error ?? '' }` }</p>
      <button onClick={ () => onConfirm( true ) }>confirm delete</button>
    </div>
  ),
} ) )

const sources = (): GmailSourcesState => ( {
  sources: [],
  isLoading: false,
  error: null,
  updatedAt: 0,
  createSource: mutationStub(),
  updateSource: mutationStub(),
  deleteSource: mutationStub(),
  checkSource: mutationStub(),
  checkAllSources: mutationStub(),
} )

const onClose = vi.fn()

beforeEach( () => {
  onClose.mockReset()
} )

type Dialog = Parameters< typeof GmailDialogs >[ 0 ][ 'dialog' ]

const render = ( dialog: Dialog, state = sources() ) => {
  renderWithClient(
    <GmailDialogs
      dialog={ dialog }
      profiles={ profilesFixture() }
      sources={ state }
      onClose={ onClose }
    />,
  )

  return state
}

describe( 'GmailDialogs', () => {
  it( 'renders nothing when no dialog is open', () => {
    render( null )

    expect( screen.queryByText( /dialog/i ) ).not.toBeInTheDocument()
  } )

  it( 'adds a source and closes on success', async () => {
    const state = render( { kind: 'add' } )

    await userEvent.click( screen.getByRole( 'button', { name: 'submit add' } ) )

    expect( state.createSource.mutate ).toHaveBeenCalledWith(
      { name: 'New' },
      { onSuccess: onClose },
    )
  } )

  it( 'passes the add progress and error on', () => {
    const state = sources()

    state.createSource = mutationStub( { isPending: true, error: new Error( 'Nope' ) } )
    render( { kind: 'add' }, state )

    expect( screen.getByText( 'Add dialog true Nope' ) ).toBeInTheDocument()
  } )

  it( 'cancels the add dialog', async () => {
    render( { kind: 'add' } )

    await userEvent.click( screen.getByRole( 'button', { name: 'cancel add' } ) )

    expect( onClose ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'edits a source and closes on success', async () => {
    const state = render( { kind: 'edit', source: gmailSourceFixture() } )

    expect( screen.getByText( 'Edit dialog Newsletters false' ) ).toBeInTheDocument()

    await userEvent.click( screen.getByRole( 'button', { name: 'submit edit' } ) )

    expect( state.updateSource.mutate ).toHaveBeenCalledWith(
      { id: SOURCE_ID, body: { enabled: false } },
      { onSuccess: onClose },
    )
  } )

  it( 'deletes a source with the chosen inbox option and closes on success', async () => {
    const state = render( { kind: 'delete', source: gmailSourceFixture() } )

    await userEvent.click( screen.getByRole( 'button', { name: 'confirm delete' } ) )

    expect( state.deleteSource.mutate ).toHaveBeenCalledWith(
      { id: SOURCE_ID, removeInboxItems: true },
      { onSuccess: onClose },
    )
  } )
} )

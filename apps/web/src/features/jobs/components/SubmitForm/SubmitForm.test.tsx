// Testing Library
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import {
  BUSINESS_ID,
  modelsFixture,
  profilesFixture,
} from '#src/features/jobs/fixtures/summarizer.fixture'
import { SubmitForm } from './SubmitForm'

const validUrl = 'https://www.youtube.com/watch?v=cFoaK1OQRhw'
const validationMessage = 'Enter a URL starting with http:// or https://'

const setup = ( props: { isSubmitting?: boolean, error?: string | null } = {} ) => {
  const onSubmit = vi.fn()

  render( <SubmitForm isSubmitting={ false } error={ null } onSubmit={ onSubmit } { ...props } /> )

  return { onSubmit, user: userEvent.setup() }
}

describe( 'SubmitForm', () => {
  it( 'renders a named form, a labelled input and a button', () => {
    setup()

    expect( screen.getByRole( 'form', { name: 'Add a video or article' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'URL' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'button', { name: 'Transcribe' } ) ).toBeInTheDocument()
  } )

  it( 'submits a valid URL', async () => {
    const { onSubmit, user } = setup()

    await user.type( screen.getByRole( 'textbox', { name: 'URL' } ), validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( onSubmit ).toHaveBeenCalledTimes( 1 )
    expect( onSubmit ).toHaveBeenCalledWith( { url: validUrl } )
  } )

  it( 'trims surrounding spaces', async () => {
    const { onSubmit, user } = setup()

    await user.type( screen.getByRole( 'textbox', { name: 'URL' } ), `  ${ validUrl }  ` )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( onSubmit ).toHaveBeenCalledWith( { url: validUrl } )
  } )

  it( 'submits on Enter', async () => {
    const { onSubmit, user } = setup()

    await user.type( screen.getByRole( 'textbox', { name: 'URL' } ), `${ validUrl }{Enter}` )

    expect( onSubmit ).toHaveBeenCalledWith( { url: validUrl } )
  } )

  it.each( [ '', 'ftp://example.com', 'not a url' ] )(
    'rejects %j with a message',
    async ( value ) => {
      const { onSubmit, user } = setup()
      const input = screen.getByRole( 'textbox', { name: 'URL' } )

      if( value ) {
        await user.type( input, value )
      }
      await user.click( screen.getByRole( 'button', { name: /^(Transcribe|Summarize)$/ } ) )

      expect( screen.getByRole( 'alert' ) ).toHaveTextContent( validationMessage )
      expect( input ).toHaveAttribute( 'aria-invalid', 'true' )
      expect( input ).toHaveAccessibleDescription( validationMessage )
      expect( onSubmit ).not.toHaveBeenCalled()
    },
  )

  it( 'clears the validation message when the user types', async () => {
    const { user } = setup()
    const input = screen.getByRole( 'textbox', { name: 'URL' } )

    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )
    expect( screen.getByRole( 'alert' ) ).toBeInTheDocument()

    await user.type( input, 'h' )

    expect( screen.queryByRole( 'alert' ) ).not.toBeInTheDocument()
    expect( input ).not.toHaveAttribute( 'aria-invalid', 'true' )
  } )

  it( 'disables the form while submitting', async () => {
    const { onSubmit, user } = setup( { isSubmitting: true } )
    const button = screen.getByRole( 'button', { name: 'Starting…' } )

    await user.click( button )

    expect( button ).toBeDisabled()
    expect( screen.getByRole( 'textbox', { name: 'URL' } ) ).toBeDisabled()
    expect( onSubmit ).not.toHaveBeenCalled()
  } )

  it( 'shows the error prop in an alert that describes the input', () => {
    setup( { error: 'Could not reach the server' } )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
    expect( screen.getByRole( 'textbox', { name: 'URL' } ) )
      .toHaveAccessibleDescription( 'Could not reach the server' )
  } )

  it( 'does not mark the input invalid for a server error', () => {
    setup( { error: 'Could not reach the server' } )

    expect( screen.getByRole( 'textbox', { name: 'URL' } ) )
      .not.toHaveAttribute( 'aria-invalid', 'true' )
  } )
} )

describe( 'SubmitForm, summary options', () => {
  const options = {
    profiles: profilesFixture(),
    models: modelsFixture().models,
    profileId: BUSINESS_ID,
    model: 'claude-sonnet-5-5',
    isLoading: false,
    onProfileChange: vi.fn(),
    onModelChange: vi.fn(),
  }

  it( 'has no profile or model selects without options', () => {
    setup()

    expect( screen.queryByRole( 'combobox', { name: 'Prompt profile' } ) ).not.toBeInTheDocument()
    expect( screen.queryByRole( 'combobox', { name: 'Model' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows the profile and model selects between the URL and the button', () => {
    const onSubmit = vi.fn()
    render(
      <SubmitForm
        isSubmitting={ false }
        error={ null }
        onSubmit={ onSubmit }
        options={ options }
      />,
    )

    const url = screen.getByRole( 'textbox', { name: 'URL' } )
    const profile = screen.getByRole( 'combobox', { name: 'Prompt profile' } )
    const button = screen.getByRole( 'button', { name: 'Transcribe' } )

    expect( url.compareDocumentPosition( profile ) ).toBe( Node.DOCUMENT_POSITION_FOLLOWING )
    expect( profile.compareDocumentPosition( button ) ).toBe( Node.DOCUMENT_POSITION_FOLLOWING )
    expect( screen.getByRole( 'combobox', { name: 'Model' } ) ).toBeInTheDocument()
  } )

  it( 'still submits just the URL', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <SubmitForm
        isSubmitting={ false }
        error={ null }
        onSubmit={ onSubmit }
        options={ options }
      />,
    )

    await user.type( screen.getByRole( 'textbox', { name: 'URL' } ), validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( onSubmit ).toHaveBeenCalledExactlyOnceWith( { url: validUrl } )
  } )
} )

const articleUrl = 'https://example.com/posts/ownership'
const pasted = 'Pasted words go here. '.repeat( 15 )

const typeUrl = async ( user: ReturnType< typeof userEvent.setup >, url: string ) => {
  await user.type( screen.getByRole( 'textbox', { name: 'URL' } ), url )
}

describe( 'SubmitForm, source type', () => {
  it( 'hides the switch while the field is empty', () => {
    setup()

    expect( screen.queryByRole( 'group', { name: 'Source type' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows the detected type under the field: Video for YouTube', async () => {
    const { user } = setup()

    await typeUrl( user, validUrl )

    expect( screen.getByRole( 'button', { name: 'Video' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
    expect( screen.getByRole( 'button', { name: 'Article' } ) )
      .toHaveAttribute( 'aria-pressed', 'false' )
    expect( screen.getByRole( 'button', { name: 'Transcribe' } ) ).toBeInTheDocument()
  } )

  it( 'shows Article for another site, with the Summarize button', async () => {
    const { user } = setup()

    await typeUrl( user, articleUrl )

    expect( screen.getByRole( 'button', { name: 'Article' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
    expect( screen.getByRole( 'button', { name: 'Summarize' } ) ).toBeInTheDocument()
  } )

  it( 'follows the URL until the user picks a type', async () => {
    const { user } = setup()
    const input = screen.getByRole( 'textbox', { name: 'URL' } )

    await user.type( input, validUrl )
    await user.clear( input )
    await user.type( input, articleUrl )

    expect( screen.getByRole( 'button', { name: 'Article' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
  } )

  it( 'lets the user override the type, and keeps it while the URL is edited', async () => {
    const { user } = setup()
    const input = screen.getByRole( 'textbox', { name: 'URL' } )

    await typeUrl( user, validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Article' } ) )
    await user.type( input, '&t=5' )

    expect( screen.getByRole( 'button', { name: 'Article' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
    expect( screen.getByRole( 'button', { name: 'Summarize' } ) ).toBeInTheDocument()
  } )

  it( 'forgets the override when the field is cleared', async () => {
    const { user } = setup()
    const input = screen.getByRole( 'textbox', { name: 'URL' } )

    await typeUrl( user, validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Article' } ) )
    await user.clear( input )
    await user.type( input, validUrl )

    expect( screen.getByRole( 'button', { name: 'Video' } ) )
      .toHaveAttribute( 'aria-pressed', 'true' )
  } )

  it( 'sends source_type only when it differs from the detected type', async () => {
    const { onSubmit, user } = setup()

    await typeUrl( user, validUrl )
    await user.click( screen.getByRole( 'button', { name: 'Article' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( onSubmit ).toHaveBeenLastCalledWith( { url: validUrl, source_type: 'article' } )

    await user.click( screen.getByRole( 'button', { name: 'Video' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( onSubmit ).toHaveBeenLastCalledWith( { url: validUrl } )
  } )

  it( 'says only YouTube works, and sends nothing, for Video on another site', async () => {
    const { onSubmit, user } = setup()

    await typeUrl( user, articleUrl )
    await user.click( screen.getByRole( 'button', { name: 'Video' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Only YouTube videos are supported' )
    expect( onSubmit ).not.toHaveBeenCalled()
  } )

  it.each( [ 'https://vimeo.com/123', 'https://www.twitch.tv/videos/1' ] )(
    'refuses %s with the YouTube-only message instead of treating it as an article',
    async ( link ) => {
      const { onSubmit, user } = setup()
      const input = screen.getByRole( 'textbox', { name: 'URL' } )

      await typeUrl( user, link )
      await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

      expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Only YouTube videos are supported' )
      expect( input ).toHaveAttribute( 'aria-invalid', 'true' )
      expect( onSubmit ).not.toHaveBeenCalled()
    },
  )
} )

describe( 'SubmitForm, pasted text', () => {
  const openPaste = async ( user: ReturnType< typeof userEvent.setup > ) => {
    await typeUrl( user, articleUrl )
    await user.click( screen.getByRole( 'button', { name: 'Paste text instead' } ) )
  }

  it( 'offers Paste text instead only for an article', async () => {
    const { user } = setup()

    expect( screen.queryByRole( 'button', { name: 'Paste text instead' } ) ).not.toBeInTheDocument()

    await typeUrl( user, validUrl )

    expect( screen.queryByRole( 'button', { name: 'Paste text instead' } ) ).not.toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Article' } ) )

    expect( screen.getByRole( 'button', { name: 'Paste text instead' } ) ).toBeInTheDocument()
  } )

  it( 'reveals the title and article text fields', async () => {
    const { user } = setup()

    await openPaste( user )

    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Article text' } ) ).toBeInTheDocument()
  } )

  it( 'submits the URL with the trimmed text and title', async () => {
    const { onSubmit, user } = setup()

    await openPaste( user )
    await user.type( screen.getByRole( 'textbox', { name: 'Title' } ), '  My title  ' )
    await user.click( screen.getByRole( 'textbox', { name: 'Article text' } ) )
    await user.paste( `  ${ pasted }  ` )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( onSubmit ).toHaveBeenCalledExactlyOnceWith( {
      url: articleUrl,
      text: pasted.trim(),
      title: 'My title',
    } )
  } )

  it( 'leaves the title out when it is blank', async () => {
    const { onSubmit, user } = setup()

    await openPaste( user )
    await user.click( screen.getByRole( 'textbox', { name: 'Article text' } ) )
    await user.paste( pasted )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( onSubmit ).toHaveBeenCalledExactlyOnceWith( { url: articleUrl, text: pasted.trim() } )
  } )

  it( 'refuses text that is too short, saying why', async () => {
    const { onSubmit, user } = setup()

    await openPaste( user )
    await user.click( screen.getByRole( 'textbox', { name: 'Article text' } ) )
    await user.paste( 'too short' )
    await user.click( screen.getByRole( 'button', { name: 'Summarize' } ) )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'at least 200 characters' )
    expect( onSubmit ).not.toHaveBeenCalled()
  } )

  it( 'clears the text when the section is collapsed', async () => {
    const { user } = setup()

    await openPaste( user )
    await user.click( screen.getByRole( 'textbox', { name: 'Article text' } ) )
    await user.paste( pasted )
    await user.click( screen.getByRole( 'button', { name: 'Don’t paste text' } ) )
    await user.click( screen.getByRole( 'button', { name: 'Paste text instead' } ) )

    expect( screen.getByRole( 'textbox', { name: 'Article text' } ) ).toHaveValue( '' )
  } )

  it( 'closes and clears the section when the type is switched to Video', async () => {
    const { onSubmit, user } = setup()

    await openPaste( user )
    await user.click( screen.getByRole( 'textbox', { name: 'Article text' } ) )
    await user.paste( pasted )
    await user.click( screen.getByRole( 'button', { name: 'Video' } ) )

    expect( screen.queryByRole( 'textbox', { name: 'Article text' } ) ).not.toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Transcribe' } ) )

    // The pasted text is gone, so this is only a video chosen for a site that is not YouTube
    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Only YouTube videos are supported' )
    expect( onSubmit ).not.toHaveBeenCalled()
  } )

  it( 'closes the section when the field is cleared', async () => {
    const { user } = setup()

    await openPaste( user )
    await user.clear( screen.getByRole( 'textbox', { name: 'URL' } ) )

    expect( screen.queryByRole( 'textbox', { name: 'Article text' } ) ).not.toBeInTheDocument()
  } )
} )

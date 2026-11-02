// Packages
import { useState } from 'react'
// Shared
import { parseNote, serializeNote } from '@atlas/shared'
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
import { PropertiesPanel } from './PropertiesPanel'

const note = serializeNote( {
  properties: {
    title: 'How Rust Works',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Rust Channel',
    duration: '05:00',
    created: '2026-10-15',
    tags: [ 'mnemosyne', 'rust' ],
  },
  body: '## Summary\n\n* Text [[Link]]\n',
} )

describe( 'PropertiesPanel', () => {
  it( 'shows the title, the tags and the read-only properties', () => {
    render( <PropertiesPanel note={ note } onChange={ vi.fn() } /> )

    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toHaveValue( 'How Rust Works' )
    expect( screen.getByRole( 'list', { name: 'Tags' } ) ).toHaveTextContent( 'mnemosyne' )
    expect( screen.getByRole( 'list', { name: 'Tags' } ) ).toHaveTextContent( 'rust' )
    expect( screen.getByText( 'https://www.youtube.com/watch?v=abc' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Rust Channel' ) ).toBeInTheDocument()
    expect( screen.getByText( '05:00' ) ).toBeInTheDocument()
    expect( screen.getByText( 'on save' ) ).toBeInTheDocument()
  } )

  it( 'writes a title change back into the note and keeps the body', async () => {
    const onChange = vi.fn()
    render( <PropertiesPanel note={ note } onChange={ onChange } /> )

    await userEvent.setup().type( screen.getByRole( 'textbox', { name: 'Title' } ), '!' )

    const changed = parseNote( onChange.mock.calls[ 0 ]?.[ 0 ] as string )
    expect( changed.properties.title ).toBe( 'How Rust Works!' )
    expect( changed.properties.tags ).toEqual( [ 'mnemosyne', 'rust' ] )
    expect( changed.body ).toBe( '## Summary\n\n* Text [[Link]]\n' )
  } )

  it( 'adds and removes tags with mnemosyne kept first', async () => {
    const onChange = vi.fn()
    render( <PropertiesPanel note={ note } onChange={ onChange } /> )
    const user = userEvent.setup()

    await user.type( screen.getByRole( 'textbox', { name: 'Add tag' } ), 'go{Enter}' )
    await user.click( screen.getByRole( 'button', { name: 'Remove tag rust' } ) )

    expect( parseNote( onChange.mock.calls[ 0 ]?.[ 0 ] as string ).properties.tags )
      .toEqual( [ 'mnemosyne', 'rust', 'go' ] )
    expect( parseNote( onChange.mock.calls[ 1 ]?.[ 0 ] as string ).properties.tags )
      .toEqual( [ 'mnemosyne' ] )
  } )

  it( 'shows front-matter invalid and offers no fields for a broken note', () => {
    const onChange = vi.fn()
    render( <PropertiesPanel note={ 'title: "A\n---\n\nBody' } onChange={ onChange } /> )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'front-matter invalid' )
    expect( screen.queryByRole( 'textbox', { name: 'Title' } ) ).not.toBeInTheDocument()
    expect( onChange ).not.toHaveBeenCalled()
  } )

  it( 'recovers when the note parses again', () => {
    const { rerender } = render( <PropertiesPanel note="not a note" onChange={ vi.fn() } /> )

    rerender( <PropertiesPanel note={ note } onChange={ vi.fn() } /> )

    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toHaveValue( 'How Rust Works' )
  } )

  it( 'keeps typing working when the parent feeds the note back', async () => {
    function Host(): React.ReactElement {
      const [ value, setValue ] = useState( note )

      return <PropertiesPanel note={ value } onChange={ setValue } />
    }
    render( <Host /> )

    await userEvent.setup().type( screen.getByRole( 'textbox', { name: 'Title' } ), ' 2' )

    expect( screen.getByRole( 'textbox', { name: 'Title' } ) ).toHaveValue( 'How Rust Works 2' )
  } )
} )

describe( 'PropertiesPanel for an article', () => {
  const articleNote = ( overrides: Record< string, string | undefined > = {} ): string => {
    return serializeNote( {
      properties: {
        title: 'A post',
        source: 'https://example.com/post',
        author: 'Ada',
        site: 'Example',
        published: '2026-10-01',
        created: '2026-10-18',
        tags: [ 'mnemosyne' ],
        ...overrides,
      },
      body: 'Body\n',
    } )
  }

  it( 'shows Source, Author, Site, Published and Created, not Channel or Duration', () => {
    render( <PropertiesPanel note={ articleNote() } onChange={ vi.fn() } /> )

    expect( screen.getByText( 'Author' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Ada' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Site' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Example' ) ).toBeInTheDocument()
    expect( screen.getByText( 'Published' ) ).toBeInTheDocument()
    expect( screen.getByText( '2026-10-01' ) ).toBeInTheDocument()
    expect( screen.getByText( 'https://example.com/post' ) ).toBeInTheDocument()
    expect( screen.queryByText( 'Channel' ) ).not.toBeInTheDocument()
    expect( screen.queryByText( 'Duration' ) ).not.toBeInTheDocument()
  } )

  it( 'leaves out the properties the article does not have', () => {
    const note = articleNote( { author: undefined, site: undefined, published: undefined } )

    render( <PropertiesPanel note={ note } onChange={ vi.fn() } /> )

    expect( screen.queryByText( 'Author' ) ).not.toBeInTheDocument()
    expect( screen.queryByText( 'Site' ) ).not.toBeInTheDocument()
    expect( screen.queryByText( 'Published' ) ).not.toBeInTheDocument()
    expect( screen.getByText( 'Source' ) ).toBeInTheDocument()
  } )

  it( 'keeps the article properties when the title is edited', async () => {
    const onChange = vi.fn()
    render( <PropertiesPanel note={ articleNote() } onChange={ onChange } /> )

    await userEvent.setup().type( screen.getByRole( 'textbox', { name: 'Title' } ), '!' )

    const { properties } = parseNote( onChange.mock.calls[ 0 ]?.[ 0 ] as string )

    expect( properties ).toMatchObject( { title: 'A post!', author: 'Ada', site: 'Example' } )
    expect( properties.channel ).toBeUndefined()
  } )
} )

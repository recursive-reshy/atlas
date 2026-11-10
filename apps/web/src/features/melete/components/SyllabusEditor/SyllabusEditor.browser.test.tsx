// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { page, userEvent } from 'vitest/browser'
// Shared
import type { MeleteSyllabus } from '@atlas/shared'
// App
import { syllabusFixture } from '#src/features/melete/fixtures/syllabus.fixture'
import { theme } from '#src/theme'
import { SyllabusEditor } from './SyllabusEditor'

const MIN_TAP_SIZE = 44
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const
const MODES = [ 'light', 'dark' ] as const

// A long name with no break opportunity, longer than a phone is wide
const LONG_NAME = 'Supercalifragilisticexpialidocious'.repeat( 3 )

// Stands in for the server: a save becomes the stored syllabus, new rows get ids
function Harness( { initial }: { initial: MeleteSyllabus } ): ReactElement {
  const [ syllabus, setSyllabus ] = useState( initial )

  return (
    <SyllabusEditor
      key={ JSON.stringify( syllabus ) }
      syllabus={ syllabus }
      status="draft"
      isBusy={ false }
      savedDiff={ null }
      onApprove={ () => undefined }
      onRedraft={ () => undefined }
      onSave={ ( edit ) => setSyllabus( {
        sections: edit.sections.map( ( section ) => ( {
          id: section.id ?? crypto.randomUUID(),
          name: section.name,
          concepts: section.concepts.map( ( concept ) => ( {
            id: concept.id ?? crypto.randomUUID(),
            name: concept.name,
            description: concept.description,
          } ) ),
        } ) ),
      } ) }
    />
  )
}

const renderEditor = ( mode: ( typeof MODES )[ number ], initial = syllabusFixture() ): void => {
  render(
    <ThemeProvider theme={ theme } defaultMode={ mode } storageManager={ null } noSsr>
      <CssBaseline />
      <Harness initial={ initial } />
    </ThemeProvider>,
  )
}

const conceptNames = (): string[] => {
  return screen.getAllByRole( 'textbox', { name: 'Concept name' } )
    .map( ( field ) => ( field as HTMLInputElement ).value )
}

const scrollbarFree = (): boolean => {
  const { scrollWidth, clientWidth } = document.documentElement

  return scrollWidth <= clientWidth
}

beforeEach( () => {
  window.scrollTo( 0, 0 )
} )

describe.each( SIZES )( 'SyllabusEditor at $name size', ( { width, height } ) => {
  it.each( MODES )( 'reorders with real clicks and keeps the order, %s', async ( mode ) => {
    await page.viewport( width, height )
    renderEditor( mode )

    await userEvent.click( screen.getByRole( 'button', { name: 'Move Joins up' } ) )
    await userEvent.click( screen.getByRole( 'button', { name: 'Move Joins down' } ) )
    await userEvent.click( screen.getByRole( 'button', { name: 'Move SQL down' } ) )

    await expect.poll( conceptNames ).toEqual( [ 'Joins', 'SQL', 'Windows' ] )

    // The last concept of a section goes down into the next section, ahead of its concepts
    await userEvent.click( screen.getByRole( 'button', { name: 'Move SQL down' } ) )
    await userEvent.click( screen.getByRole( 'button', { name: 'Move Windows up' } ) )

    await expect.poll( conceptNames ).toEqual( [ 'Joins', 'Windows', 'SQL' ] )

    await userEvent.click( screen.getByRole( 'button', { name: 'Save changes' } ) )

    await expect.poll( () => screen.getByRole( 'button', { name: 'Save changes' } ) )
      .toBeDisabled()
    expect( conceptNames() ).toEqual( [ 'Joins', 'Windows', 'SQL' ] )
    expect( screen.getAllByRole( 'textbox', { name: 'Section name' } )
      .map( ( field ) => ( field as HTMLInputElement ).value ) ).toEqual( [ 'Basics', 'Advanced' ] )
  } )

  it.each( MODES )( 'fits the window, with controls of a tappable size, %s', async ( mode ) => {
    const long = syllabusFixture()

    long.sections[ 0 ].concepts[ 0 ].name = LONG_NAME
    await page.viewport( width, height )
    renderEditor( mode, long )

    expect( scrollbarFree() ).toBe( true )

    for( const button of screen.getAllByRole( 'button' ) ) {
      const box = button.getBoundingClientRect()

      expect( box.height, button.getAttribute( 'aria-label' ) ?? button.textContent ?? '' )
        .toBeGreaterThanOrEqual( MIN_TAP_SIZE )
      expect( box.right ).toBeLessThanOrEqual( window.innerWidth )
    }
  } )
} )

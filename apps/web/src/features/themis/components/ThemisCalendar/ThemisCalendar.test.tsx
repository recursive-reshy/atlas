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
import { renderWithClient } from '#src/test-support/renderWithClient'
import { ThemisCalendar } from './ThemisCalendar'

vi.mock( '../CalendarDrafts', () => ( {
  CalendarDrafts: ( { onMakeRule }: { onMakeRule: ( title: string ) => void } ) => (
    <button type="button" onClick={ () => onMakeRule( 'Lunch' ) }>drafts tab</button>
  ),
} ) )
vi.mock( '../CalendarRules', () => ( {
  CalendarRules: ( { initialPhrase }: { initialPhrase?: string } ) => (
    <p>{ `rules tab: ${ initialPhrase ?? '' }` }</p>
  ),
} ) )

describe( 'ThemisCalendar', () => {
  it( 'has a heading and a way back to Themis', () => {
    renderWithClient( <ThemisCalendar /> )

    expect( screen.getByRole( 'heading', { level: 1, name: 'Calendar' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Themis' } ) ).toHaveAttribute( 'href', '/themis' )
  } )

  it( 'opens on Drafts', () => {
    renderWithClient( <ThemisCalendar /> )

    expect( screen.getByRole( 'tab', { name: 'Drafts', selected: true } ) ).toBeInTheDocument()
    expect( screen.getByText( 'drafts tab' ) ).toBeInTheDocument()
  } )

  it( 'falls back to Drafts for a tab it does not know', () => {
    renderWithClient( <ThemisCalendar />, { route: '/themis/calendar?tab=other' } )

    expect( screen.getByText( 'drafts tab' ) ).toBeInTheDocument()
  } )

  it( 'opens on Rules from the URL', () => {
    renderWithClient( <ThemisCalendar />, { route: '/themis/calendar?tab=rules' } )

    expect( screen.getByRole( 'tab', { name: 'Rules', selected: true } ) ).toBeInTheDocument()
    expect( screen.getByText( 'rules tab:' ) ).toBeInTheDocument()
  } )

  it( 'puts the tab in the URL', async () => {
    const { location } = renderWithClient( <ThemisCalendar /> )

    await userEvent.setup().click( screen.getByRole( 'tab', { name: 'Rules' } ) )

    expect( location().search ).toBe( '?tab=rules' )
  } )

  it( 'moves to Rules with the draft\'s title when a rule is made from it', async () => {
    const { location } = renderWithClient( <ThemisCalendar /> )

    await userEvent.setup().click( screen.getByRole( 'button', { name: 'drafts tab' } ) )

    expect( location().search ).toBe( '?tab=rules&phrase=Lunch' )
    expect( screen.getByText( 'rules tab: Lunch' ) ).toBeInTheDocument()
  } )
} )

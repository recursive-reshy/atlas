// Testing Library
import { screen } from '@testing-library/react'
// Vitest
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { memberFixture } from '#src/test-support/me.fixture'
import { renderWithRouter } from '#src/test-support/renderWithRouter'

vi.mock( './features/melete/components/MeleteToday', () => (
  { MeleteToday: () => <p>melete today</p> }
) )
vi.mock( './features/jobs/components/TranscriberHome', () => (
  { TranscriberHome: () => <p>transcriber home</p> }
) )
vi.mock( './features/jobs/components/JobPage', () => ( { JobPage: () => <p>a job</p> } ) )
vi.mock( './features/home/components/HomeScreen', () => (
  { HomeScreen: () => <p>home screen</p> }
) )
vi.mock( './features/themis/components/ThemisHome', () => (
  { ThemisHome: () => <p>themis home</p> }
) )
vi.mock( './features/themis/components/ThemisGoal', () => (
  { ThemisGoal: () => <p>themis goal</p> }
) )
vi.mock( './app/AppShell', () => ( {
  AppShell: ( { children }: { children: unknown } ) => <>{ children as never }</>,
} ) )

describe( 'routes and the gate', () => {
  it( 'shows sign-in instead of the page to a signed-out visitor', () => {
    renderWithRouter( '/', { me: null } )

    expect( screen.getByRole( 'button', { name: 'Sign in with Google' } ) ).toBeInTheDocument()
    expect( screen.queryByText( 'home screen' ) ).not.toBeInTheDocument()
  } )

  it( 'serves /signin without the app, with its error', () => {
    renderWithRouter( '/signin?error=not_allowed', { me: null } )

    expect( screen.getByRole( 'alert' ).textContent ).toContain( 'not allowed' )
  } )

  it( 'sends a signed-in user from /signin to the app', () => {
    const me = memberFixture( { modules: [ 'transcriber', 'themis' ] } )
    const { location } = renderWithRouter( '/signin', { me } )

    expect( location().pathname ).toBe( '/' )
    expect( screen.getByText( 'home screen' ) ).toBeInTheDocument()
  } )

  it( 'sends a Melete-only member who opens an unknown path to Melete', () => {
    const me = memberFixture( { modules: [ 'melete' ] } )
    const { location } = renderWithRouter( '/nowhere', { me } )

    expect( location().pathname ).toBe( '/melete' )
    expect( screen.getByText( 'melete today' ) ).toBeInTheDocument()
  } )

  it( 'keeps a Melete-only member off the Transcriber home page', () => {
    const me = memberFixture( { modules: [ 'melete' ] } )
    const { location } = renderWithRouter( '/transcriber', { me } )

    expect( location().pathname ).toBe( '/melete' )
    expect( screen.queryByText( 'transcriber home' ) ).not.toBeInTheDocument()
  } )

  it( 'keeps a Transcriber-only member off Melete', () => {
    const me = memberFixture( { modules: [ 'transcriber' ] } )
    const { location } = renderWithRouter( '/melete', { me } )

    expect( location().pathname ).toBe( '/transcriber' )
    expect( screen.getByText( 'transcriber home' ) ).toBeInTheDocument()
  } )

  it( 'serves the Transcriber at /transcriber', () => {
    const me = memberFixture( { modules: [ 'transcriber' ] } )

    renderWithRouter( '/transcriber', { me } )
    expect( screen.getByText( 'transcriber home' ) ).toBeInTheDocument()
  } )

  it( 'serves a job under /transcriber', () => {
    const me = memberFixture( { modules: [ 'transcriber' ] } )
    const { location } = renderWithRouter( '/transcriber/jobs/abc', { me } )

    expect( location().pathname ).toBe( '/transcriber/jobs/abc' )
    expect( screen.getByText( 'a job' ) ).toBeInTheDocument()
  } )

  it( 'redirects the old /jobs/:id to /transcriber/jobs/:id', () => {
    const me = memberFixture( { modules: [ 'transcriber' ] } )
    const { location } = renderWithRouter( '/jobs/abc', { me } )

    expect( location().pathname ).toBe( '/transcriber/jobs/abc' )
    expect( screen.getByText( 'a job' ) ).toBeInTheDocument()
  } )

  it( 'lands a user with Themis on Home from the root and from an unknown path', () => {
    const me = memberFixture( { modules: [ 'transcriber', 'themis' ] } )
    const { location } = renderWithRouter( '/nowhere', { me } )

    expect( location().pathname ).toBe( '/' )
    expect( screen.getByText( 'home screen' ) ).toBeInTheDocument()
  } )

  it( 'sends a user without Themis from / to their first module, with no loop', () => {
    const me = memberFixture( { modules: [ 'transcriber', 'melete' ] } )
    const { location } = renderWithRouter( '/', { me } )

    expect( location().pathname ).toBe( '/transcriber' )
    expect( screen.queryByText( 'home screen' ) ).not.toBeInTheDocument()
  } )

  it( 'still serves Themis at /themis', () => {
    const me = memberFixture( { modules: [ 'transcriber', 'themis' ] } )
    const { location } = renderWithRouter( '/themis', { me } )

    expect( location().pathname ).toBe( '/themis' )
    expect( screen.getByText( 'themis home' ) ).toBeInTheDocument()
  } )

  it( 'serves a goal page to a user with Themis', () => {
    const me = memberFixture( { modules: [ 'themis' ] } )
    const { location } = renderWithRouter( '/themis/goals/g1', { me } )

    expect( location().pathname ).toBe( '/themis/goals/g1' )
    expect( screen.getByText( 'themis goal' ) ).toBeInTheDocument()
  } )

  it( 'keeps a member without Themis off it', () => {
    const me = memberFixture( { modules: [ 'transcriber' ] } )
    const { location } = renderWithRouter( '/themis', { me } )

    expect( location().pathname ).toBe( '/transcriber' )
    expect( screen.queryByText( 'themis home' ) ).not.toBeInTheDocument()
  } )
} )

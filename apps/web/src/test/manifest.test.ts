// Packages
import { describe, it, expect } from 'vitest'
// Packages
import type { RouteObject } from 'react-router'
// App
import indexHtml from '/index.html?raw'
import manifestText from '/public/manifest.webmanifest?raw'
import { routes } from '../routes'

type Manifest = {
  name: string
  short_name: string
  start_url: string
  scope: string
  display: string
  background_color: string
  theme_color: string
  icons: { src: string, sizes: string, type: string, purpose: string }[]
}

const manifest = JSON.parse( manifestText ) as Manifest

describe( 'manifest.webmanifest', () => {
  it( 'names the app and opens it standalone on Home', () => {
    expect( manifest.name ).toBe( 'Atlas' )
    expect( manifest.short_name ).toBe( 'Atlas' )
    expect( manifest.display ).toBe( 'standalone' )
    expect( manifest.scope ).toBe( '/' )
    expect( manifest.start_url ).toBe( '/' )
    expect( manifest.background_color ).toMatch( /^#[0-9a-f]{6}$/i )
    expect( manifest.theme_color ).toMatch( /^#[0-9a-f]{6}$/i )
  } )

  it( 'starts on a route the app has', () => {
    const join = ( prefix: string, path: string ): string => (
      `${ prefix }/${ path }`.replace( /\/+/g, '/' )
    )
    const pathsOf = ( list: RouteObject[], prefix = '' ): string[] => list.flatMap( ( route ) => {
      const here = route.path === undefined ? prefix : join( prefix, route.path )
      const own = route.index === true ? [ prefix === '' ? '/' : prefix ] : []

      return [
        ...own,
        ...( route.path === undefined ? [] : [ here ] ),
        ...pathsOf( route.children ?? [], here ),
      ]
    } )
    const paths = pathsOf( routes )

    expect( paths ).toContain( manifest.start_url )
  } )

  it( 'lists the two plain icons and the maskable one', () => {
    expect( manifest.icons ).toEqual( [
      {
        src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any',
      },
      {
        src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any',
      },
      {
        src: 'icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ] )
  } )
} )

describe( 'index.html', () => {
  it.each( [
    '<link rel="manifest" href="/manifest.webmanifest"',
    '<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png"',
    '<link rel="icon" type="image/svg+xml" href="/icons/favicon.svg"',
    '<meta name="theme-color" content="#f4f5f7" media="(prefers-color-scheme: light)"',
    '<meta name="theme-color" content="#12141a" media="(prefers-color-scheme: dark)"',
    '<meta name="apple-mobile-web-app-capable" content="yes"',
    '<meta name="mobile-web-app-capable" content="yes"',
    '<meta name="apple-mobile-web-app-title" content="Atlas"',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default"',
    'content="width=device-width, initial-scale=1.0, viewport-fit=cover"',
  ] )( 'contains %s', ( fragment ) => {
    expect( indexHtml ).toContain( fragment )
  } )
} )

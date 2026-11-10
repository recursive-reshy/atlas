// Node
import { readFileSync } from 'node:fs'
// Packages
import { describe, it, expect } from 'vitest'

const read = ( name: string ): string => readFileSync(
  new URL( `./${ name }.service.ts`, import.meta.url ),
  'utf8',
)

describe( 'the job services', () => {
  it( 'import jobs.service, never the reverse', () => {
    for( const name of [ 'jobLinking', 'jobDraft', 'jobRender' ] ) {
      expect( read( 'jobs' ) ).not.toContain( `./${ name }.service.js` )
      expect( read( name ) ).toContain( './jobs.service.js' )
    }
  } )

  it( 'keep render beneath draft and linking', () => {
    expect( read( 'jobRender' ) ).not.toMatch( /job(Draft|Linking)\.service/ )
    expect( read( 'jobDraft' ) ).not.toContain( './jobLinking.service.js' )
  } )
} )

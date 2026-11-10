// Vitest
import { describe, expect, it } from 'vitest'
// App
import { meFixture, memberFixture } from '#src/test-support/me.fixture'
import { settingsTabs } from './settingsTabs'

const values = ( me: Parameters< typeof settingsTabs >[ 0 ] ): string[] => {
  return settingsTabs( me ).map( ( { value } ) => value )
}

describe( 'settingsTabs', () => {
  it( 'gives the admin every tab, Admin last', () => {
    expect( values( meFixture() ) ).toEqual( [ 'prompts', 'models', 'sources', 'admin' ] )
  } )

  it( 'gives a Transcriber member Prompts, Models and Sources', () => {
    expect( values( memberFixture( { modules: [ 'transcriber' ] } ) ) )
      .toEqual( [ 'prompts', 'models', 'sources' ] )
  } )

  it( 'gives a Melete-only member Prompts and Models', () => {
    expect( values( memberFixture( { modules: [ 'melete' ] } ) ) )
      .toEqual( [ 'prompts', 'models' ] )
  } )

  it( 'gives a member with both modules Sources but never Admin', () => {
    expect( values( memberFixture( { modules: [ 'transcriber', 'melete' ] } ) ) )
      .toEqual( [ 'prompts', 'models', 'sources' ] )
  } )

  it( 'gives nobody signed in nothing', () => {
    expect( values( null ) ).toEqual( [] )
  } )

  it( 'labels the tabs', () => {
    expect( settingsTabs( meFixture() ).map( ( { label } ) => label ) )
      .toEqual( [ 'Prompts', 'Models', 'Sources', 'Admin' ] )
  } )
} )

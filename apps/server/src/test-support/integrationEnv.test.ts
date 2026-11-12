// Packages
import { describe, expect, it } from 'vitest'
// Local
import { applyIntegrationPlaceholders } from './integrationEnv.js'

describe( 'applyIntegrationPlaceholders', () => {
  it( 'fills every variable the config needs but integration tests never use', () => {
    const env: NodeJS.ProcessEnv = {}

    applyIntegrationPlaceholders( env )

    expect( Object.keys( env ).sort() ).toEqual( [
      'ADMIN_EMAIL', 'APP_ORIGINS', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'YOUTUBE_API_KEY',
    ] )
  } )

  it( 'leaves a real value alone and replaces an empty one', () => {
    const env: NodeJS.ProcessEnv = { GEMINI_API_KEY: 'real-key', YOUTUBE_API_KEY: '' }

    applyIntegrationPlaceholders( env )

    expect( env.GEMINI_API_KEY ).toBe( 'real-key' )
    expect( env.YOUTUBE_API_KEY ).toBe( 'test-youtube-key' )
  } )

  it( 'never touches the Claude key', () => {
    const env: NodeJS.ProcessEnv = {}

    applyIntegrationPlaceholders( env )

    expect( env.ANTHROPIC_API_KEY ).toBeUndefined()
  } )
} )

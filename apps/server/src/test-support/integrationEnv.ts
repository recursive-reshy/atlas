// Variables config parsing requires but no integration test uses, as in vitest.config.ts
const PLACEHOLDERS: Readonly< Record< string, string > > = {
  GEMINI_MODEL: 'test-gemini',
  GEMINI_API_KEY: 'test-gemini-api-key',
  YOUTUBE_API_KEY: 'test-youtube-key',
  ADMIN_EMAIL: 'admin@example.com',
  APP_ORIGINS: 'http://localhost:3100',
}

// Call after .env is loaded: a real value wins; empty counts as unset (docs/configuration.md)
export const applyIntegrationPlaceholders = ( env: NodeJS.ProcessEnv ): void => {
  for( const [ name, value ] of Object.entries( PLACEHOLDERS ) ) {
    if( env[ name ] === undefined || env[ name ] === '' ) env[ name ] = value
  }
}

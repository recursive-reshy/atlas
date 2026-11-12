// Node
import { existsSync } from 'node:fs'
// Packages
import { defineConfig } from 'vitest/config'
// Local
import { applyIntegrationPlaceholders } from './src/test-support/integrationEnv.js'

// Integration tests need ANTHROPIC_API_KEY from .env; other required variables get placeholders.
if( existsSync( '.env' ) ) {
  process.loadEnvFile( '.env' )
}
applyIntegrationPlaceholders( process.env )

export default defineConfig( {
  resolve: {
    conditions: [ 'development' ],
  },
  test: {
    setupFiles: [ './src/test-support/database.setup.ts' ],
    include: [ 'src/**/*.integration.test.ts' ],
    passWithNoTests: true,
    testTimeout: 600_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
} )

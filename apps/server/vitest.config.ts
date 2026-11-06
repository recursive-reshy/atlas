import { defineConfig } from 'vitest/config'

export default defineConfig( {
  resolve: {
    conditions: [ 'development' ],
  },
  test: {
    env: {
      ANTHROPIC_API_KEY: 'test-key',
      GEMINI_MODEL: 'test-gemini',
      GOOGLE_CLOUD_PROJECT: 'test-project',
      YOUTUBE_API_KEY: 'test-youtube-key',
      LOG_LEVEL: 'silent',
      ADMIN_EMAIL: 'admin@example.com',
      APP_ORIGINS: 'http://localhost:3100',
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      TOKEN_ENCRYPTION_KEY: Buffer.alloc( 32, 7 ).toString( 'base64' ),
    },
    setupFiles: [ './src/test-support/vaults.setup.ts', './src/test-support/database.setup.ts' ],
    include: [ 'src/**/*.test.ts' ],
    exclude: [ 'src/**/*.integration.test.ts' ],
  },
} )

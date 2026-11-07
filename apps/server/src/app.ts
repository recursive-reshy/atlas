// Express
import express, { Express } from 'express'
// Config
import { config } from './config.js'
// Errors
import { errorMiddleware, notFoundHandler } from './errors.js'
// Middleware
import { requireAdmin, requireUser } from './middleware/auth.js'
import { jsonOnly } from './middleware/jsonOnly.js'
import { requestLog } from './middleware/requestLog.js'
import { requireModule } from './middleware/requireModule.js'
// Routes
import { authRoutes } from './routes/auth.routes.js'
import { adminRoutes } from './routes/admin.routes.js'
import { feedsRoutes } from './routes/feeds.routes.js'
import { gmailRoutes } from './routes/gmail.routes.js'
import { gmailSourcesRoutes } from './routes/gmailSources.routes.js'
import { healthRoutes } from './routes/health.routes.js'
import { inboxRoutes } from './routes/inbox.routes.js'
import { jobsRoutes } from './routes/jobs.routes.js'
import { meleteRoutes } from './routes/melete.routes.js'
import { meRoutes } from './routes/me.routes.js'
import { modelsRoutes } from './routes/models.routes.js'
import { promptProfilesRoutes } from './routes/promptProfiles.routes.js'
import { settingsRoutes } from './routes/settings.routes.js'
import { statusRoutes } from './routes/status.routes.js'
import { themisRoutes } from './routes/themis.routes.js'
import { testSessionRoutes } from './routes/testSession.routes.js'
import { vaultRoutes } from './routes/vault.routes.js'
import { webRoutes } from './routes/web.routes.js'

export const app: Express = express()

app.use( '/api', requestLog )
app.use( '/api', express.json( { limit: '2mb' } ) )
app.use( '/api', jsonOnly )
app.use( '/api', healthRoutes )
app.use( '/api', authRoutes )

// Only the e2e stack mounts this, and the server refuses to start with it outside NODE_ENV=test
if( config.e2eTestSignin ) {
  app.use( '/api', testSessionRoutes )
}

app.use( '/api', requireUser )
app.use( '/api', meRoutes )
app.use( '/api/admin', requireAdmin, adminRoutes )
// Each module's routes are refused, as if unknown, to a user without the module (ADR 0068).
// Settings, models, prompt profiles and status are shared and filter by module themselves.
app.use(
  [ '/api/jobs', '/api/feeds', '/api/inbox', '/api/gmail', '/api/vault' ],
  requireModule( 'transcriber' ),
)
app.use( '/api/melete', requireModule( 'melete' ) )
app.use( '/api/themis', requireModule( 'themis' ) )
app.use( '/api', jobsRoutes )
app.use( '/api', feedsRoutes )
app.use( '/api', inboxRoutes )
app.use( '/api', gmailRoutes )
app.use( '/api', gmailSourcesRoutes )
app.use( '/api', vaultRoutes )
app.use( '/api', settingsRoutes )
app.use( '/api', modelsRoutes )
app.use( '/api', promptProfilesRoutes )
app.use( '/api', statusRoutes )
app.use( '/api', meleteRoutes )
app.use( '/api', themisRoutes )
app.use( '/api', notFoundHandler )

if( config.webDir !== undefined ) {
  app.use( webRoutes( config.webDir ) )
}

app.use( errorMiddleware )

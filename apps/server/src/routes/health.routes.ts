// Express
import { Router } from 'express'
// Middleware
import { requireTrustedPeer } from '../middleware/trustedPeer.js'
// Controllers
import { getHealth } from '../controllers/health.controller.js'

export const healthRoutes: Router = Router()

healthRoutes.get( '/health', requireTrustedPeer, getHealth )

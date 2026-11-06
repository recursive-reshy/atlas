// Config
import { config } from '../config.js'
// Clients
import { googleAccessToken } from './gemini.client.js'
import type { GeminiOptions } from './gemini.client.js'

// The one place the app's settings become Gemini options, for the adapter and the status check
export const geminiOptions = (): GeminiOptions => ( {
  project: config.googleCloudProject,
  location: config.geminiLocation,
  model: config.geminiModel,
  getAccessToken: googleAccessToken,
} )

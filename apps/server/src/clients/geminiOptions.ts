// Config
import { config } from '../config.js'
// Clients
import type { GeminiOptions } from './gemini.client.js'
import type { YouTubeDataOptions } from './youtubeData.client.js'

// The one place the app's settings become Gemini options, for the adapter and the status check.
// The base URL exists only for the e2e stack's fakes.
export const geminiOptions = (): GeminiOptions => ( {
  model: config.geminiModel,
  apiKey: config.geminiApiKey,
  ...config.geminiBaseUrl === null ? {} : { baseUrl: config.geminiBaseUrl },
} )

export const youtubeDataOptions = (): YouTubeDataOptions => ( {
  apiKey: config.youtubeApiKey,
  ...config.youtubeApiBaseUrl === null ? {} : { baseUrl: config.youtubeApiBaseUrl },
} )

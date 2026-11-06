// Config
import { config } from '../config.js'
// Clients
import { googleAccessToken } from './gemini.client.js'
import type { GeminiOptions } from './gemini.client.js'
import type { YouTubeDataOptions } from './youtubeData.client.js'

// The one place the app's settings become Gemini options, for the adapter and the status check.
// The base URL and the fixed token exist only for the e2e stack's fakes.
export const geminiOptions = (): GeminiOptions => {
  const { geminiAccessToken, geminiBaseUrl } = config

  return {
    project: config.googleCloudProject,
    location: config.geminiLocation,
    model: config.geminiModel,
    getAccessToken: geminiAccessToken === null
      ? googleAccessToken
      : () => Promise.resolve( geminiAccessToken ),
    ...geminiBaseUrl === null ? {} : { baseUrl: geminiBaseUrl },
  }
}

export const youtubeDataOptions = (): YouTubeDataOptions => ( {
  apiKey: config.youtubeApiKey,
  ...config.youtubeApiBaseUrl === null ? {} : { baseUrl: config.youtubeApiBaseUrl },
} )

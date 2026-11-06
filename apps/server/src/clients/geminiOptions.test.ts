// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Clients
import { googleAccessToken } from './gemini.client.js'
import { geminiOptions, youtubeDataOptions } from './geminiOptions.js'

const configMock = vi.hoisted( () => ( {
  geminiModel: 'gemini-3.8-flash',
  googleCloudProject: 'atlas-prod',
  geminiLocation: 'global',
  youtubeApiKey: 'yt-key',
  geminiBaseUrl: null as string | null,
  youtubeApiBaseUrl: null as string | null,
  geminiAccessToken: null as string | null,
} ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( './gemini.client.js', () => ( { googleAccessToken: vi.fn() } ) )

beforeEach( () => {
  configMock.geminiBaseUrl = null
  configMock.youtubeApiBaseUrl = null
  configMock.geminiAccessToken = null
} )

describe( 'geminiOptions', () => {
  it( 'takes the project, location and model from the config and signs in with ADC', () => {
    const options = geminiOptions()

    expect( options ).toEqual( {
      project: 'atlas-prod',
      location: 'global',
      model: 'gemini-3.8-flash',
      getAccessToken: googleAccessToken,
    } )
    expect( options ).not.toHaveProperty( 'baseUrl' )
  } )

  it( 'points at another host when GEMINI_BASE_URL is set (the e2e fakes)', () => {
    configMock.geminiBaseUrl = 'http://fakes:4000'

    expect( geminiOptions().baseUrl ).toBe( 'http://fakes:4000' )
  } )

  it( 'uses a fixed token instead of ADC when GEMINI_ACCESS_TOKEN is set', async () => {
    configMock.geminiAccessToken = 'e2e-token'

    expect( await geminiOptions().getAccessToken() ).toBe( 'e2e-token' )
    expect( googleAccessToken ).not.toHaveBeenCalled()
  } )
} )

describe( 'youtubeDataOptions', () => {
  it( 'carries the API key and no base URL by default', () => {
    expect( youtubeDataOptions() ).toEqual( { apiKey: 'yt-key' } )
  } )

  it( 'points at another host when YOUTUBE_API_BASE_URL is set', () => {
    configMock.youtubeApiBaseUrl = 'http://fakes:4000'

    expect( youtubeDataOptions() ).toEqual( { apiKey: 'yt-key', baseUrl: 'http://fakes:4000' } )
  } )
} )

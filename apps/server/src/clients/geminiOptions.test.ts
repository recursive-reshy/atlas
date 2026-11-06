// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Clients
import { geminiOptions, youtubeDataOptions } from './geminiOptions.js'

const configMock = vi.hoisted( () => ( {
  geminiModel: 'gemini-3.8-flash',
  geminiApiKey: 'AIza-gemini-key',
  youtubeApiKey: 'yt-key',
  geminiBaseUrl: null as string | null,
  youtubeApiBaseUrl: null as string | null,
} ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )

beforeEach( () => {
  configMock.geminiBaseUrl = null
  configMock.youtubeApiBaseUrl = null
} )

describe( 'geminiOptions', () => {
  it( 'takes the model and the API key from the config', () => {
    const options = geminiOptions()

    expect( options ).toEqual( { model: 'gemini-3.8-flash', apiKey: 'AIza-gemini-key' } )
    expect( options ).not.toHaveProperty( 'baseUrl' )
  } )

  it( 'points at another host when GEMINI_BASE_URL is set (the e2e fakes)', () => {
    configMock.geminiBaseUrl = 'http://fakes:4000'

    expect( geminiOptions().baseUrl ).toBe( 'http://fakes:4000' )
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

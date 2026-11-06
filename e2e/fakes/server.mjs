import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import {
  ARTICLE,
  ARTICLE_2,
  FEED,
  MELETE_GRADE,
  MELETE_QUESTIONS,
  MODELS,
  SUGGESTIONS,
  SUMMARY,
} from './fixtures.mjs'

const SUBMIT_TOOL = 'submit_suggestions'
// The Gemini model the e2e stack is configured with (GEMINI_MODEL in docker-compose.e2e.yml)
const GEMINI_MODEL = 'gemini-e2e'
const TRANSCRIPT = 'Welcome to the talk. Today we cover ownership.\n\nMemory safety comes free.'
const USAGE = { input_tokens: 1200, output_tokens: 300 }

const json = ( status, value ) => ( {
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify( value ),
} )

const text = ( contentType, body ) => ( {
  status: 200,
  headers: { 'content-type': contentType },
  body,
} )

const refuse = ( message ) => json( 400, {
  type: 'error',
  error: { type: 'invalid_request_error', message: `e2e fake: ${ message }` },
} )

const message = ( model, content, stopReason ) => json( 200, {
  id: 'msg_e2e',
  type: 'message',
  role: 'assistant',
  model,
  content,
  stop_reason: stopReason,
  stop_sequence: null,
  usage: USAGE,
} )

// The locked instructions start every system prompt, so their first line tells the callers apart.
const SYSTEM_ANSWERS = [
  [ 'You summarize ', SUMMARY ],
  [ 'You write active-recall questions', MELETE_QUESTIONS ],
  [ 'You grade a learner\'s answer', MELETE_GRADE ],
]

const firstLine = ( system ) => {
  const value = Array.isArray( system )
    ? system.map( ( block ) => block?.text ?? '' ).join( '\n' )
    : system

  return typeof value === 'string' ? value.trimStart().split( '\n' )[ 0 ] : ''
}

const answerMessages = ( rawBody ) => {
  let request

  try {
    request = JSON.parse( rawBody )
  } catch{
    return refuse( 'the request body is not JSON' )
  }

  if( typeof request?.model !== 'string' || !Array.isArray( request.messages ) ) {
    return refuse( 'the request needs a model and messages' )
  }

  if( request.tools === undefined ) {
    const line = firstLine( request.system )
    const answer = SYSTEM_ANSWERS.find( ( [ start ] ) => line.startsWith( start ) )

    if( answer === undefined ) {
      return refuse( `the system prompt starts with an unknown line: ${ line.slice( 0, 60 ) }` )
    }

    return message( request.model, [ { type: 'text', text: JSON.stringify( answer[ 1 ] ) } ], 'end_turn' )
  }

  const hasSubmit = Array.isArray( request.tools )
    && request.tools.some( ( tool ) => tool?.name === SUBMIT_TOOL )

  if( !hasSubmit ) {
    return refuse( `the tools list does not include ${ SUBMIT_TOOL }` )
  }

  return message(
    request.model,
    [ { type: 'tool_use', id: 'toolu_e2e', name: SUBMIT_TOOL, input: SUGGESTIONS } ],
    'tool_use',
  )
}

export const route = ( method, path, body = '' ) => {
  if( method === 'GET' ) {
    if( path === '/article' ) {
      return text( 'text/html; charset=utf-8', ARTICLE )
    }

    if( path === '/article-2' ) {
      return text( 'text/html; charset=utf-8', ARTICLE_2 )
    }

    if( path === '/feed.xml' ) {
      return text( 'application/rss+xml; charset=utf-8', FEED )
    }

    if( path === '/health' ) {
      return json( 200, { status: 'ok' } )
    }

    if( path === '/v1/models' ) {
      return json( 200, MODELS )
    }

    if( path.startsWith( '/v1beta/models/' ) ) {
      const id = decodeURIComponent( path.slice( '/v1beta/models/'.length ) )

      return id === GEMINI_MODEL
        ? json( 200, { name: `models/${ id }`, supportedGenerationMethods: [ 'generateContent' ] } )
        : json( 404, {
          error: { code: 404, message: `models/${ id } is not found.`, status: 'NOT_FOUND' },
        } )
    }

    if( path === '/youtube/v3/videos' ) {
      return json( 200, { items: [ {
        snippet: { title: 'A talk about ownership', channelTitle: 'Fake Channel' },
        contentDetails: { duration: 'PT5M30S' },
        status: { privacyStatus: 'public' },
      } ] } )
    }
  }

  if( method === 'POST' && /^\/v1beta\/models\/[^/]+:generateContent$/.test( path ) ) {
    return json( 200, {
      candidates: [ { content: { parts: [ { text: TRANSCRIPT } ] }, finishReason: 'STOP' } ],
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 },
    } )
  }

  if( method === 'POST' && path === '/v1/messages' ) {
    return answerMessages( body )
  }

  return refuse( `no route for ${ method } ${ path }` )
}

const readBody = async ( request ) => {
  const chunks = []

  for await ( const chunk of request ) {
    chunks.push( chunk )
  }

  return Buffer.concat( chunks ).toString( 'utf8' )
}

const start = ( port ) => {
  const server = createServer( ( request, response ) => {
    void readBody( request ).then( ( body ) => {
      const { pathname } = new URL( request.url ?? '/', 'http://fakes' )
      const result = route( request.method ?? 'GET', pathname, body )

      response.writeHead( result.status, result.headers )
      response.end( result.body )
    } )
  } )

  server.listen( port, '0.0.0.0' )
}

if( process.argv[ 1 ] === fileURLToPath( import.meta.url ) ) {
  start( Number( process.env.PORT ?? 4000 ) )
}

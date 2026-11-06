import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { route } from './server.mjs'
import { RECALL_NOTE } from './fixtures.mjs'

const post = ( body ) => route( 'POST', '/v1/messages', typeof body === 'string' ? body : JSON.stringify( body ) )
const request = ( system ) => ( {
  model: 'fake-sonnet',
  max_tokens: 100,
  system,
  messages: [ { role: 'user', content: 'x' } ],
} )
const summaryRequest = request( 'You summarize an article for a personal Obsidian vault.\n\nMore rules.' )
const questionsRequest = request( 'You write active-recall questions from one study note.\n\nMore rules.' )
const gradingRequest = request( 'You grade a learner\'s answer against a reference answer and passage.\n\nMore.' )
const linkerRequest = {
  ...summaryRequest,
  tools: [ { name: 'list_notes' }, { name: 'submit_suggestions' } ],
}

describe( 'pages', () => {
  it( 'serves two articles as HTML with enough text to read', () => {
    for( const path of [ '/article', '/article-2' ] ) {
      const response = route( 'GET', path )

      assert.equal( response.status, 200 )
      assert.match( response.headers[ 'content-type' ], /^text\/html/ )
      assert.match( response.body, /<article>/ )
      assert.ok( response.body.length > 1500 )
    }
  } )

  it( 'serves an RSS feed of two items linking to the articles', () => {
    const response = route( 'GET', '/feed.xml' )

    assert.equal( response.status, 200 )
    assert.match( response.headers[ 'content-type' ], /xml/ )
    assert.equal( response.body.match( /<item>/g )?.length, 2 )
    assert.match( response.body, /<link>http:\/\/fakes:4000\/article<\/link>/ )
    assert.match( response.body, /<link>http:\/\/fakes:4000\/article-2<\/link>/ )
  } )

  it( 'answers /health with 200 for the Compose health check', () => {
    assert.equal( route( 'GET', '/health' ).status, 200 )
  } )

  it( 'answers 400 to an unknown path or method', () => {
    assert.equal( route( 'GET', '/nope' ).status, 400 )
    assert.equal( route( 'POST', '/article' ).status, 400 )
    assert.equal( route( 'GET', '/v1/messages' ).status, 400 )
  } )
} )

describe( 'GET /v1/models', () => {
  it( 'lists a Sonnet and a Haiku the summarizer can use', () => {
    const response = route( 'GET', '/v1/models' )
    const { data } = JSON.parse( response.body )

    assert.equal( response.status, 200 )
    assert.equal( data.length, 2 )
    assert.ok( data.some( ( model ) => /sonnet/.test( model.id ) ) )
    assert.ok( data.some( ( model ) => /haiku/.test( model.id ) ) )

    for( const model of data ) {
      assert.equal( model.type, 'model' )
      assert.equal( model.capabilities.structured_outputs.supported, true )
      assert.equal( model.capabilities.effort.medium.supported, true )
      assert.ok( model.max_tokens > 0 )
    }
  } )
} )

describe( 'Gemini on Vertex AI', () => {
  const generate = '/v1/projects/e2e/locations/global/publishers/google/models/gemini-e2e:generateContent'

  it( 'knows the model, so the Transcription status row is healthy', () => {
    const response = route( 'GET', '/v1/publishers/google/models/gemini-e2e' )

    assert.equal( response.status, 200 )
    assert.equal( JSON.parse( response.body ).name, 'publishers/google/models/gemini-e2e' )
  } )

  it( 'answers 404 with a Google-shaped error for any other model', () => {
    const response = route( 'GET', '/v1/publishers/google/models/nope' )

    assert.equal( response.status, 404 )
    assert.match( JSON.parse( response.body ).error.message, /nope/ )
    assert.equal( JSON.parse( response.body ).error.status, 'NOT_FOUND' )
  } )

  it( 'answers generateContent with a fixed transcript and token counts', () => {
    const response = route( 'POST', generate, '{}' )
    const body = JSON.parse( response.body )

    assert.equal( response.status, 200 )
    assert.ok( body.candidates[ 0 ].content.parts[ 0 ].text.length > 20 )
    assert.equal( body.candidates[ 0 ].finishReason, 'STOP' )
    assert.equal( typeof body.usageMetadata.promptTokenCount, 'number' )
    assert.equal( typeof body.usageMetadata.candidatesTokenCount, 'number' )
  } )
} )

describe( 'YouTube Data API', () => {
  it( 'answers videos.list with one public video', () => {
    const response = route( 'GET', '/youtube/v3/videos' )
    const [ item ] = JSON.parse( response.body ).items

    assert.equal( response.status, 200 )
    assert.ok( item.snippet.title.length > 0 )
    assert.ok( item.snippet.channelTitle.length > 0 )
    assert.match( item.contentDetails.duration, /^PT/ )
    assert.equal( item.status.privacyStatus, 'public' )
  } )
} )

describe( 'POST /v1/messages without tools (the summarizer)', () => {
  it( 'answers with an article summary as JSON text', () => {
    const response = post( summaryRequest )
    const message = JSON.parse( response.body )
    const summary = JSON.parse( message.content[ 0 ].text )

    assert.equal( response.status, 200 )
    assert.equal( message.type, 'message' )
    assert.equal( message.role, 'assistant' )
    assert.equal( message.stop_reason, 'end_turn' )
    assert.equal( message.content[ 0 ].type, 'text' )
    assert.ok( message.usage.input_tokens > 0 && message.usage.output_tokens > 0 )
    assert.deepEqual( Object.keys( summary ).sort(), [ 'key_points', 'overview', 'quotes', 'tags' ] )
    assert.equal( typeof summary.overview, 'string' )

    for( const list of [ summary.key_points, summary.quotes, summary.tags ] ) {
      assert.ok( list.length > 0 )
      assert.ok( list.every( ( item ) => typeof item === 'string' ) )
    }
  } )
} )

describe( 'POST /v1/messages for the summarizer, by its system prompt', () => {
  it( 'answers the video prompt with the summary too', () => {
    const video = request( 'You summarize the transcript of a video for a personal Obsidian vault.' )
    const message = JSON.parse( post( video ).body )

    assert.ok( JSON.parse( message.content[ 0 ].text ).overview )
  } )
} )

describe( 'POST /v1/messages for Melete', () => {
  it( 'writes two questions whose passages are in the fixture note', () => {
    const response = post( questionsRequest )
    const message = JSON.parse( response.body )
    const { questions } = JSON.parse( message.content[ 0 ].text )

    assert.equal( response.status, 200 )
    assert.equal( message.stop_reason, 'end_turn' )
    assert.equal( questions.length, 2 )

    for( const question of questions ) {
      assert.ok( question.prompt.length > 0 && question.answer.length > 0 )
      assert.ok( RECALL_NOTE.includes( question.passage ), `${ question.passage } is not in the note` )
      assert.ok( question.passage.length > 0 )
    }
  } )

  it( 'grades an answer as partial and suggests Hard', () => {
    const response = post( gradingRequest )
    const grade = JSON.parse( JSON.parse( response.body ).content[ 0 ].text )

    assert.equal( response.status, 200 )
    assert.equal( grade.verdict, 'partial' )
    assert.equal( grade.suggested_rating, 'hard' )
    assert.ok( grade.right.length > 0 && grade.right.length <= 6 )
    assert.ok( grade.missed.length > 0 && grade.missed.length <= 6 )
    assert.ok( grade.feedback.length > 0 && grade.feedback.length <= 600 )
  } )

  it( 'reads a system prompt given as text blocks', () => {
    const blocks = request( [ { type: 'text', text: 'You grade a learner\'s answer against more.' } ] )
    const grade = JSON.parse( JSON.parse( post( blocks ).body ).content[ 0 ].text )

    assert.equal( grade.verdict, 'partial' )
  } )
} )

describe( 'POST /v1/messages with tools (the linker)', () => {
  it( 'submits two suggestions whose anchors are phrases of the summary', () => {
    const summary = JSON.parse( JSON.parse( post( summaryRequest ).body ).content[ 0 ].text )
    const text = [ summary.overview, ...summary.key_points, ...summary.quotes ].join( ' ' )
    const response = post( linkerRequest )
    const message = JSON.parse( response.body )
    const block = message.content.find( ( item ) => item.type === 'tool_use' )

    assert.equal( response.status, 200 )
    assert.equal( message.stop_reason, 'tool_use' )
    assert.equal( block.name, 'submit_suggestions' )
    assert.equal( block.input.suggestions.length, 2 )

    for( const suggestion of block.input.suggestions ) {
      assert.ok( suggestion.target.length > 0 )
      assert.ok( text.includes( suggestion.anchor ), `${ suggestion.anchor } is not in the summary` )
    }
  } )
} )

describe( 'unexpected requests', () => {
  it( 'answers 400 with an error body to a body that is not JSON', () => {
    const response = post( 'not json' )

    assert.equal( response.status, 400 )
    assert.equal( JSON.parse( response.body ).type, 'error' )
  } )

  it( 'answers 400 to a system prompt it does not know', () => {
    const response = post( request( 'You are a helpful assistant.' ) )

    assert.equal( response.status, 400 )
    assert.match( JSON.parse( response.body ).error.message, /system prompt/ )
  } )

  it( 'answers 400 to a request without a system prompt', () => {
    assert.equal( post( { model: 'm', messages: [ { role: 'user', content: 'x' } ] } ).status, 400 )
  } )

  it( 'answers 400 to a request without a model', () => {
    assert.equal( post( { messages: [] } ).status, 400 )
  } )

  it( 'answers 400 to a tools list without submit_suggestions', () => {
    const response = post( { ...summaryRequest, tools: [ { name: 'list_notes' } ] } )

    assert.equal( response.status, 400 )
    assert.match( JSON.parse( response.body ).error.message, /submit_suggestions/ )
  } )
} )

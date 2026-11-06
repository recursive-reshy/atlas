// Packages
import { describe, it, expect } from 'vitest'
// Source
import {
  ONLY_YOUTUBE_MESSAGE,
  detectSourceType,
  isOtherVideoHost,
  videoRefusal,
} from './detectSourceType.js'

describe( 'detectSourceType', () => {
  it.each( [
    'https://www.youtube.com/watch?v=abc',
    'https://youtube.com/watch?v=abc',
    'https://m.youtube.com/watch?v=abc',
    'https://music.youtube.com/watch?v=abc',
    'https://youtu.be/abc',
  ] )( 'treats %s as a video', ( url ) => {
    expect( detectSourceType( url ) ).toBe( 'video' )
  } )

  it.each( [
    'https://medium.com/@a/post-1',
    'https://example.com/blog/post',
    'https://notyoutube.com/watch?v=abc',
    'https://youtube.com.example.com/post',
    'https://example.com/?next=https://youtube.com',
    'https://vimeo.com/123',
    'https://www.twitch.tv/videos/1',
  ] )( 'treats %s as an article (only YouTube is a video, ADR 0081)', ( url ) => {
    expect( detectSourceType( url ) ).toBe( 'article' )
  } )

  it( 'treats an unparseable URL as an article', () => {
    expect( detectSourceType( 'not a url' ) ).toBe( 'article' )
  } )

  it( 'ignores the case of the host', () => {
    expect( detectSourceType( 'https://WWW.YouTube.com/watch?v=abc' ) ).toBe( 'video' )
  } )
} )

describe( 'isOtherVideoHost', () => {
  it.each( [
    'https://vimeo.com/123',
    'https://player.vimeo.com/video/123',
    'https://www.dailymotion.com/video/x1',
    'https://www.tiktok.com/@a/video/1',
    'https://m.twitch.tv/videos/1',
    'https://WWW.VIMEO.com/1',
  ] )( 'knows %s', ( url ) => {
    expect( isOtherVideoHost( url ) ).toBe( true )
  } )

  it.each( [
    'https://www.youtube.com/watch?v=abc',
    'https://example.com/vimeo.com',
    'https://notvimeo.com/1',
    'not a url',
  ] )( 'does not know %s', ( url ) => {
    expect( isOtherVideoHost( url ) ).toBe( false )
  } )
} )

describe( 'videoRefusal', () => {
  const youtube = 'https://www.youtube.com/watch?v=abc'

  it( 'has the one message', () => {
    expect( ONLY_YOUTUBE_MESSAGE ).toBe( 'Only YouTube videos are supported' )
  } )

  it.each( [
    [ { url: 'https://vimeo.com/123' } ],
    [ { url: 'https://www.twitch.tv/videos/1', source_type: 'video' as const } ],
    [ { url: 'https://example.com/post', source_type: 'video' as const } ],
  ] )( 'refuses %j', ( body ) => {
    expect( videoRefusal( body ) ).toBe( ONLY_YOUTUBE_MESSAGE )
  } )

  it.each( [
    [ { url: youtube } ],
    [ { url: youtube, source_type: 'video' as const } ],
    [ { url: 'https://example.com/post' } ],
    [ { url: 'https://vimeo.com/123', source_type: 'article' as const } ],
  ] )( 'allows %j', ( body ) => {
    expect( videoRefusal( body ) ).toBeNull()
  } )
} )

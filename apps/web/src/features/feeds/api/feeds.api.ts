// Shared
import {
  FeedResponse,
  ListFeedsResponse,
  PreviewFeedResponse,
} from '@atlas/shared'
import type {
  CreateFeedBody,
  Feed,
  UpdateFeedBody,
} from '@atlas/shared'
// App
import { request, send } from '#src/lib/request'

const feedPath = ( id: string ): string => `/api/feeds/${ encodeURIComponent( id ) }`

const jsonInit = ( method: string, body: unknown ): RequestInit => {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  }
}

export const listFeeds = async (): Promise< Feed[] > => {
  const { feeds } = await request( '/api/feeds', ListFeedsResponse )
  return feeds
}

export const previewFeed = async ( url: string ): Promise< PreviewFeedResponse > => {
  return request( '/api/feeds/preview', PreviewFeedResponse, jsonInit( 'POST', { url } ) )
}

export const createFeed = async ( body: CreateFeedBody ): Promise< Feed > => {
  const { feed } = await request( '/api/feeds', FeedResponse, jsonInit( 'POST', body ) )
  return feed
}

export const updateFeed = async ( id: string, body: UpdateFeedBody ): Promise< Feed > => {
  const { feed } = await request( feedPath( id ), FeedResponse, jsonInit( 'PATCH', body ) )
  return feed
}

export const deleteFeed = async ( id: string, removeItems: boolean ): Promise< void > => {
  await send( `${ feedPath( id ) }?remove_items=${ removeItems }`, { method: 'DELETE' } )
}

export const checkFeed = async ( id: string ): Promise< Feed > => {
  const { feed } = await request( `${ feedPath( id ) }/check`, FeedResponse, { method: 'POST' } )
  return feed
}

export const checkAllFeeds = async (): Promise< Feed[] > => {
  const { feeds } = await request( '/api/feeds/check', ListFeedsResponse, { method: 'POST' } )
  return feeds
}

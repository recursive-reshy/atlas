// Express
import { Request, Response } from 'express'
// Packages
import { z } from 'zod'
// Shared
import {
  CreateFeedBody,
  FeedResponse,
  ListFeedsResponse,
  PreviewFeedBody,
  PreviewFeedResponse,
  UpdateFeedBody,
} from '@atlas/shared'
// Middleware
import { currentUser } from '../middleware/auth.js'
// Services
import {
  checkAllFeeds,
  checkFeed,
  createFeed,
  deleteFeed,
  listFeeds,
  previewFeed,
  updateFeed,
} from '../services/feeds.service.js'

const DeleteQuery = z.object( {
  remove_items: z.enum( [ 'true', 'false' ] ).default( 'false' ),
} )

export const getFeeds = ( req: Request, res: Response< ListFeedsResponse > ): void => {
  res.status( 200 ).json( { feeds: listFeeds( currentUser( req ).id ) } )
}

export const previewFeedAddress = async (
  { body }: Request,
  res: Response< PreviewFeedResponse >,
): Promise< void > => {
  const { url } = PreviewFeedBody.parse( body )

  res.status( 200 ).json( await previewFeed( url ) )
}

export const addFeed = async (
  req: Request,
  res: Response< FeedResponse >,
): Promise< void > => {
  const feed = await createFeed( currentUser( req ).id, CreateFeedBody.parse( req.body ) )

  res.status( 201 ).json( { feed } )
}

export const patchFeed = (
  req: Request,
  res: Response< FeedResponse >,
): void => {
  const feed = updateFeed(
    currentUser( req ).id,
    String( req.params.id ),
    UpdateFeedBody.parse( req.body ),
  )

  res.status( 200 ).json( { feed } )
}

export const removeFeed = ( req: Request, res: Response ): void => {
  const { remove_items } = DeleteQuery.parse( req.query )

  deleteFeed(
    currentUser( req ).id,
    String( req.params.id ),
    { removeInboxItems: remove_items === 'true' },
  )

  res.status( 204 ).end()
}

export const checkOneFeed = async (
  req: Request,
  res: Response< FeedResponse >,
): Promise< void > => {
  const feed = await checkFeed( currentUser( req ).id, String( req.params.id ) )

  res.status( 200 ).json( { feed } )
}

export const checkEveryFeed = async (
  req: Request,
  res: Response< ListFeedsResponse >,
): Promise< void > => {
  const { id } = currentUser( req )

  await checkAllFeeds( id )

  res.status( 200 ).json( { feeds: listFeeds( id ) } )
}

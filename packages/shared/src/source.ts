// Packages
import { z } from 'zod'
// Transcript
import { TranscriptMeta } from './transcript.js'

export const SourceType = z.enum( [ 'video', 'article' ] )
export type SourceType = z.infer< typeof SourceType >

export const VideoSource = z.object( {
  kind: z.literal( 'video' ),
  meta: TranscriptMeta,
  text: z.string().min( 1 ),
} )
export type VideoSource = z.infer< typeof VideoSource >

export const ArticleMeta = z.object( {
  title: z.string().min( 1 ),
  source: z.url(),
  author: z.string().nullable(),
  site: z.string().nullable(),
  published: z.string().regex( /^\d{4}-\d{2}-\d{2}$/ ).nullable(),
  fetched_at: z.iso.datetime(),
  origin: z.enum( [ 'fetched', 'pasted', 'feed', 'email' ] ),
} )
export type ArticleMeta = z.infer< typeof ArticleMeta >

export const ArticleSource = z.object( {
  kind: z.literal( 'article' ),
  meta: ArticleMeta,
  markdown: z.string().min( 1 ),
} )
export type ArticleSource = z.infer< typeof ArticleSource >

export const SourceDocument = z.discriminatedUnion( 'kind', [ VideoSource, ArticleSource ] )
export type SourceDocument = z.infer< typeof SourceDocument >

export const ARTICLE_LIMITS = {
  minExtractedChars: 500,
  minPastedChars: 200,
  maxChars: 300_000,
} as const

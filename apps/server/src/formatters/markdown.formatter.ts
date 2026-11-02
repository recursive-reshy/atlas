// Shared
import { VideoSource, formatClock, splitParagraphs } from '@atlas/shared'
// Formatters
import { quoted, singleLine } from './frontmatter.js'
import { youTubeVideoId } from './youtube.js'

export const formatMarkdown = ( { meta, text }: Pick< VideoSource, 'meta' | 'text' > ): string => {
  const videoId = youTubeVideoId( meta.source )

  const frontmatter = [
    '---',
    `title: ${ quoted( meta.title ) }`,
    `source: ${ quoted( meta.source ) }`,
    `channel: ${ quoted( meta.channel ) }`,
    `duration: ${ quoted( formatClock( meta.duration_seconds ) ) }`,
    `transcribed: ${ meta.transcribed_at.slice( 0, 10 ) }`,
    `model: ${ meta.model }`,
    `tags: [${ videoId === undefined ? 'transcript' : 'transcript, youtube' }]`,
    '---',
  ].join( '\n' )

  const blocks = [ frontmatter, `# ${ singleLine( meta.title ) }`, ...splitParagraphs( text ) ]

  return `${ blocks.join( '\n\n' ) }\n`
}

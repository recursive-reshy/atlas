// Shared
import type {
  DownloadFormat,
  SourceDocument,
  VideoSource,
} from '@atlas/shared'
// Errors
import { ConflictError } from '../errors.js'
// Formatters
import { transcriptFilename } from '../formatters/filename.js'
import { formatMarkdown } from '../formatters/markdown.formatter.js'
import { formatTxt } from '../formatters/txt.formatter.js'
// Services
import { downloadableStatuses, requireJob } from './jobs.service.js'

const transcriptFormats = {
  md: { contentType: 'text/markdown; charset=utf-8', formatter: formatMarkdown },
  txt: { contentType: 'text/plain; charset=utf-8', formatter: formatTxt },
} as const

type RenderedTranscript = {
  filename: string
  contentType: string
  body: string
}

const toTranscript = (
  id: string,
  document: SourceDocument,
): Pick< VideoSource, 'meta' | 'text' > => {
  if( document.kind !== 'video' ) {
    throw new Error( `Job ${ id } is an article, not a video` )
  }

  return { meta: document.meta, text: document.text }
}

export const getSource = ( userId: string, id: string ): SourceDocument => {
  const job = requireJob( userId, id )

  if( job.source_document === null ) {
    throw new Error( `Job ${ id } has no transcript` )
  }

  return job.source_document
}

export const findSource = ( userId: string, id: string ): SourceDocument => {
  const job = requireJob( userId, id )

  if( !downloadableStatuses.includes( job.status ) ) {
    throw new ConflictError( 'Transcript not ready' )
  }

  if( job.source_document === null ) {
    throw new Error( `Job ${ id } is ${ job.status } but has no transcript` )
  }

  return job.source_document
}

export const renderTranscript = (
  userId: string,
  id: string,
  format: DownloadFormat,
): RenderedTranscript => {
  const document = findSource( userId, id )

  if( document.kind === 'article' ) {
    if( format !== 'md' ) {
      throw new ConflictError( 'Only Markdown is available for articles' )
    }

    return {
      filename: transcriptFilename( document.meta.title, format ),
      contentType: transcriptFormats.md.contentType,
      body: `# ${ document.meta.title }\n\n${ document.meta.source }\n\n${ document.markdown }`,
    }
  }

  const transcript = toTranscript( id, document )
  const { contentType, formatter } = transcriptFormats[ format ]

  return {
    filename: transcriptFilename( transcript.meta.title, format ),
    contentType,
    body: formatter( transcript ),
  }
}

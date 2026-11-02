// Shared
import { DownloadFormat, noteBasename } from '@atlas/shared'

export const transcriptFilename = ( title: string, format: DownloadFormat ): string => {
  return `${ noteBasename( title, 'transcript' ) }.${ format }`
}

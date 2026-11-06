// Source
import type { SourceType } from './source.js'

// Only YouTube is a video: Gemini reads the link itself (ADR 0081)
const VIDEO_HOSTS = [ 'youtube.com', 'youtu.be' ]

// Sites that used to be videos; a link to one is refused, not read as an article
const OTHER_VIDEO_HOSTS = [ 'vimeo.com', 'dailymotion.com', 'tiktok.com', 'twitch.tv' ]

export const ONLY_YOUTUBE_MESSAGE = 'Only YouTube videos are supported'

const hostOf = ( url: string ): string | undefined => {
  const parsed = URL.parse( url )

  return parsed === null ? undefined : parsed.hostname.toLowerCase().replace( /^(www|m)\./, '' )
}

const isOn = ( host: string | undefined, hosts: string[] ): boolean => {
  return host !== undefined
    && hosts.some( ( site ) => host === site || host.endsWith( `.${ site }` ) )
}

export const detectSourceType = ( url: string ): SourceType => {
  return isOn( hostOf( url ), VIDEO_HOSTS ) ? 'video' : 'article'
}

export const isOtherVideoHost = ( url: string ): boolean => isOn( hostOf( url ), OTHER_VIDEO_HOSTS )

// A job is refused when it would be a video that is not YouTube: a known video site left to
// detection, or a video chosen for any other page. Choosing "article" is always the person's call.
export const videoRefusal = (
  { url, source_type: sourceType }: { url: string, source_type?: SourceType | undefined },
): string | null => {
  const isRefused = sourceType === undefined
    ? isOtherVideoHost( url )
    : sourceType === 'video' && detectSourceType( url ) !== 'video'

  return isRefused ? ONLY_YOUTUBE_MESSAGE : null
}

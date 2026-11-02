// Shared
import type { SourceType } from '@atlas/shared'
// Sources
import type { SourceAdapter } from './adapter.js'
import { articleAdapter } from './article.adapter.js'
import { videoAdapter } from './video.adapter.js'

export const adapterFor = ( sourceType: SourceType ): SourceAdapter => {
  return sourceType === 'video' ? videoAdapter : articleAdapter
}

// React
import type { ReactElement } from 'react'
// Packages
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
// Shared
import type { SourceType } from '@atlas/shared'
// App
import { downloadUrl } from '#src/api/jobs.api'

const FORMATS = [
  { format: 'md', label: 'Markdown (.md)', variant: 'contained' },
  { format: 'txt', label: 'Plain text (.txt)', variant: 'outlined' },
] as const

// Only Markdown is rendered for an article
const ARTICLE_FORMATS = FORMATS.slice( 0, 1 )

interface DownloadLinksProps {
  jobId: string
  sourceType?: SourceType
}

export function DownloadLinks( { jobId, sourceType = 'video' }: DownloadLinksProps ): ReactElement {
  const isArticle = sourceType === 'article'

  return (
    <Stack
      component="section"
      aria-label={ isArticle ? 'Download article' : 'Download transcript' }
      direction="row"
      useFlexGap
      sx={ { flexWrap: 'wrap', gap: 1, width: '100%' } }
    >
      { ( isArticle ? ARTICLE_FORMATS : FORMATS ).map( ( { format, label, variant } ) => (
        <Button
          key={ format }
          component="a"
          variant={ variant }
          href={ downloadUrl( jobId, format ) }
          download
        >
          { label }
        </Button>
      ) ) }
    </Stack>
  )
}

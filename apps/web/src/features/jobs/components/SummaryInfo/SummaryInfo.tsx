// React
import type { ReactElement } from 'react'
// Packages
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { LinkUsageSummary, SummaryUsage } from '@atlas/shared'
// App
import { useModels } from '#src/features/settings/hooks/useModels'
import { formatLinkInfo, formatSummaryInfo } from './formatSummaryInfo'
import type { SummaryInfoText } from './formatSummaryInfo'

interface SummaryInfoProps {
  usage: SummaryUsage | null
  linkUsage?: LinkUsageSummary | null
}

export function SummaryInfo(
  { usage, linkUsage = null }: SummaryInfoProps,
): ReactElement | null {
  const { models } = useModels()
  const nameOf = ( model: string ): string => {
    return models.find( ( { id } ) => id === model )?.display_name ?? model
  }
  const texts: SummaryInfoText[] = []

  if( usage !== null ) {
    texts.push( formatSummaryInfo( usage, nameOf( usage.last_run.model ) ) )
  }

  if( linkUsage !== null ) {
    texts.push( formatLinkInfo( linkUsage, nameOf( linkUsage.last_run.model ) ) )
  }

  if( texts.length === 0 ) {
    return null
  }

  return (
    <Stack>
      { texts.flatMap( ( { line, attempts } ) => [
        <Typography key={ line } variant="body2" color="text.secondary">{ line }</Typography>,
        ...( attempts === null ? [] : [
          <Typography key={ `${ line }-attempts` } variant="body2" color="text.secondary">
            { attempts }
          </Typography>,
        ] ),
      ] ) }
    </Stack>
  )
}

// React
import type { ReactElement } from 'react'
// Packages
import BackIcon from '@mui/icons-material/ArrowBack'
import Link from '@mui/material/Link'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, useSearchParams } from 'react-router'
// App
import { CalendarDrafts } from '../CalendarDrafts'
import { CalendarRules } from '../CalendarRules'

type TabName = 'drafts' | 'rules'

// Calendar events to review and the rules that assign them (ADR 0108); phone first
export function ThemisCalendar(): ReactElement {
  const [ params, setParams ] = useSearchParams()
  const tab: TabName = params.get( 'tab' ) === 'rules' ? 'rules' : 'drafts'
  const phrase = params.get( 'phrase' ) ?? undefined

  return (
    <Stack spacing={ 2 } sx={ { maxWidth: '40rem' } }>
      <Link
        component={ RouterLink }
        to="/themis"
        sx={ { minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 0.5 } }
      >
        <BackIcon fontSize="small" aria-hidden />
        Themis
      </Link>
      <Typography component="h1" variant="h5">Calendar</Typography>
      <Tabs
        value={ tab }
        onChange={ ( _event, next: TabName ) => setParams( { tab: next } ) }
        aria-label="Calendar"
      >
        <Tab label="Drafts" value="drafts" sx={ { minHeight: 44 } } />
        <Tab label="Rules" value="rules" sx={ { minHeight: 44 } } />
      </Tabs>
      { tab === 'drafts'
        ? (
          <CalendarDrafts
            onMakeRule={ ( title ) => setParams( { tab: 'rules', phrase: title } ) }
          />
        )
        : <CalendarRules key={ phrase } initialPhrase={ phrase } /> }
    </Stack>
  )
}

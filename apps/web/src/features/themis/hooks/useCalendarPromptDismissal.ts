// React
import { useState } from 'react'

const KEY = 'atlas:calendar-prompt-dismissed'

const readDismissed = (): boolean => {
  try {
    return window.localStorage.getItem( KEY ) === 'true'
  } catch{
    return false
  }
}

export interface CalendarPromptDismissal {
  isDismissed: boolean
  dismiss: () => void
}

// A per-viewer convenience: without storage the prompt comes back on the next visit
export function useCalendarPromptDismissal(): CalendarPromptDismissal {
  const [ isDismissed, setIsDismissed ] = useState( readDismissed )

  const dismiss = (): void => {
    setIsDismissed( true )

    try {
      window.localStorage.setItem( KEY, 'true' )
    } catch{
      // The prompt is hidden for this visit only
    }
  }

  return { isDismissed, dismiss }
}

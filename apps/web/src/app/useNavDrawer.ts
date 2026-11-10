// React
import { useState } from 'react'

const STORAGE_KEY = 'atlas:nav-drawer'

const readIsExpanded = (): boolean => {
  try {
    return window.localStorage.getItem( STORAGE_KEY ) !== 'collapsed'
  } catch{
    // Storage is a convenience: a blocked store falls back to the default.
    return true
  }
}

const writeIsExpanded = ( isExpanded: boolean ): void => {
  try {
    window.localStorage.setItem( STORAGE_KEY, isExpanded ? 'expanded' : 'collapsed' )
  } catch{
    // Storage is a convenience: the choice just isn't remembered.
  }
}

export function useNavDrawer(): { isExpanded: boolean, toggle: () => void } {
  const [ isExpanded, setIsExpanded ] = useState( readIsExpanded )

  const toggle = (): void => {
    writeIsExpanded( !isExpanded )
    setIsExpanded( !isExpanded )
  }

  return { isExpanded, toggle }
}

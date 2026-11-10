// React
import { useEffect } from 'react'

const LEGACY_PREFIX = 'mnemosyne:draft:'

export function useRemoveLegacyDrafts(): void {
  useEffect( () => {
    try {
      const { localStorage } = window
      const keys = Array.from(
        { length: localStorage.length },
        ( _, index ) => localStorage.key( index ),
      )

      for( const key of keys ) {
        if( key?.startsWith( LEGACY_PREFIX ) === true ) {
          localStorage.removeItem( key )
        }
      }
    } catch{
      // Storage is a convenience: a blocked store must not break the app.
    }
  }, [] )
}

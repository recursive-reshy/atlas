// React
import { useEffect } from 'react'
import type { ReactElement } from 'react'
// Packages
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
// Shared
import type { MeleteRating } from '@atlas/shared'

const RATINGS: { rating: MeleteRating, label: string, key: string }[] = [
  { rating: 'again', label: 'Again', key: '1' },
  { rating: 'hard', label: 'Hard', key: '2' },
  { rating: 'good', label: 'Good', key: '3' },
  { rating: 'easy', label: 'Easy', key: '4' },
]

const BAR_SX = {
  position: 'sticky',
  bottom: 0,
  bgcolor: 'background.default',
  pt: 1,
  pb: 'max( 8px, env( safe-area-inset-bottom ) )',
} as const

const BUTTON_SX = { flex: 1, minHeight: 48 } as const

// Keys typed into a field, or Enter on a focused button, belong to that element.
const isOwnedByTarget = ( event: KeyboardEvent ): boolean => {
  const target = event.target

  if( !( target instanceof HTMLElement ) ) {
    return false
  }

  if( target.isContentEditable || [ 'INPUT', 'TEXTAREA', 'SELECT' ].includes( target.tagName ) ) {
    return true
  }

  return event.key === 'Enter' && [ 'BUTTON', 'A' ].includes( target.tagName )
}

interface RatingBarProps {
  selected: MeleteRating | null
  isDisabled: boolean
  onSelect: ( rating: MeleteRating ) => void
  onConfirm: ( rating: MeleteRating ) => void
}

export function RatingBar(
  { selected, isDisabled, onSelect, onConfirm }: RatingBarProps,
): ReactElement {
  useEffect( () => {
    const handleKeyDown = ( event: KeyboardEvent ): void => {
      const hasModifier = event.metaKey || event.ctrlKey || event.altKey

      if( isDisabled || hasModifier || isOwnedByTarget( event ) ) {
        return
      }

      const match = RATINGS.find( ( { key } ) => key === event.key )

      if( match !== undefined ) {
        onSelect( match.rating )
      } else if( event.key === 'Enter' && selected !== null ) {
        onConfirm( selected )
      }
    }

    document.addEventListener( 'keydown', handleKeyDown )

    return () => document.removeEventListener( 'keydown', handleKeyDown )
  }, [ isDisabled, selected, onSelect, onConfirm ] )

  return (
    <Box sx={ BAR_SX }>
      <Stack spacing={ 1 }>
        <Stack direction="row" spacing={ 1 }>
          { RATINGS.map( ( { rating, label } ) => (
            <Button
              key={ rating }
              variant={ rating === selected ? 'contained' : 'outlined' }
              aria-pressed={ rating === selected }
              disabled={ isDisabled }
              sx={ BUTTON_SX }
              onClick={ () => ( rating === selected ? onConfirm : onSelect )( rating ) }
            >
              { label }
            </Button>
          ) ) }
        </Stack>
        <Button
          variant="contained"
          disabled={ isDisabled || selected === null }
          sx={ BUTTON_SX }
          onClick={ () => selected !== null && onConfirm( selected ) }
        >
          Next
        </Button>
      </Stack>
    </Box>
  )
}

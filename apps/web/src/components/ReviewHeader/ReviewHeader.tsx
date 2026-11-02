// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import CloseIcon from '@mui/icons-material/Close'
import MoreIcon from '@mui/icons-material/MoreVert'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
// Shared
import type { MeleteReviewMode } from '@atlas/shared'

interface ReviewHeaderProps {
  subjectName: string
  done: number
  left: number
  mode: MeleteReviewMode
  isBusy: boolean
  onModeChange: ( mode: MeleteReviewMode ) => void
  onDrop: () => void
}

export function ReviewHeader(
  { subjectName, done, left, mode, isBusy, onModeChange, onDrop }: ReviewHeaderProps,
): ReactElement {
  const [ anchor, setAnchor ] = useState< HTMLElement | null >( null )

  return (
    <Stack spacing={ 1 }>
      <Stack direction="row" sx={ { alignItems: 'center', justifyContent: 'space-between' } }>
        <Typography variant="subtitle1" sx={ { fontWeight: 'bold', overflowWrap: 'anywhere' } }>
          { subjectName }
        </Typography>
        <Stack direction="row">
          <IconButton aria-label="More" onClick={ ( event ) => setAnchor( event.currentTarget ) }>
            <MoreIcon />
          </IconButton>
          <IconButton aria-label="Close review" component={ RouterLink } to="/melete">
            <CloseIcon />
          </IconButton>
        </Stack>
      </Stack>
      <Stack direction="row" sx={ { alignItems: 'center', justifyContent: 'space-between' } }>
        <Typography role="status" variant="body2" color="text.secondary">
          { `${ done } done · ${ left } left` }
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={ mode }
          aria-label="Review mode"
          onChange={ ( _event, next: MeleteReviewMode | null ) => {
            if( next !== null ) {
              onModeChange( next )
            }
          } }
        >
          <ToggleButton value="typed">Typed</ToggleButton>
          <ToggleButton value="quick">Quick</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Menu anchorEl={ anchor } open={ anchor !== null } onClose={ () => setAnchor( null ) }>
        <MenuItem
          disabled={ isBusy }
          onClick={ () => {
            setAnchor( null )
            onDrop()
          } }
        >
          Drop question
        </MenuItem>
      </Menu>
    </Stack>
  )
}

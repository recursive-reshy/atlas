// React
import type { ReactElement } from 'react'
// Packages
import Chip from '@mui/material/Chip'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import { Link } from 'react-router'
// Shared
import type { PromptProfile } from '@atlas/shared'

const LINKER = 'linker'

interface PromptListProps {
  hasSummary: boolean
  profiles: PromptProfile[]
  meleteProfiles: PromptProfile[]
  defaultId: string | undefined
  selectedId: string | null
}

interface ItemProps {
  id: string
  name: string
  isDefault?: boolean
  selectedId: string | null
}

function Item( { id, name, isDefault = false, selectedId }: ItemProps ): ReactElement {
  const isSelected = id === selectedId

  return (
    <ListItemButton
      component={ Link }
      to={ `/settings/prompts/${ id }` }
      selected={ isSelected }
      aria-current={ isSelected ? 'page' : undefined }
    >
      <ListItemText primary={ name } />
      { isDefault && <Chip size="small" label="Default" /> }
    </ListItemButton>
  )
}

export function PromptList(
  { hasSummary, profiles, meleteProfiles, defaultId, selectedId }: PromptListProps,
): ReactElement {
  return (
    <>
      { hasSummary && (
        <>
          <List
            dense
            aria-labelledby="summary-profiles"
            subheader={ <ListSubheader id="summary-profiles">Summary profiles</ListSubheader> }
          >
            { profiles.map( ( { id, name } ) => (
              <Item key={ id } id={ id } name={ name } isDefault={ id === defaultId }
                selectedId={ selectedId } />
            ) ) }
          </List>
          <List
            dense
            aria-labelledby="linking-prompt"
            subheader={ <ListSubheader id="linking-prompt">Linking</ListSubheader> }
          >
            <Item id={ LINKER } name="Linker prompt" selectedId={ selectedId } />
          </List>
        </>
      ) }
      { meleteProfiles.length > 0 && (
        <List
          dense
          aria-labelledby="melete-prompts"
          subheader={ <ListSubheader id="melete-prompts">Melete</ListSubheader> }
        >
          { meleteProfiles.map( ( { id, name } ) => (
            <Item key={ id } id={ id } name={ name } selectedId={ selectedId } />
          ) ) }
        </List>
      ) }
    </>
  )
}

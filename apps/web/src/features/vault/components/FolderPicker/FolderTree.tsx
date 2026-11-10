// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Chip from '@mui/material/Chip'
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView'
import { TreeItem } from '@mui/x-tree-view/TreeItem'
// App
import type { TreeNode } from './treeNodes'

// A folder path can never be '/', so it stands in for the vault root.
const ROOT_ID = '/'

const ancestorsOf = ( path: string ): string[] => {
  const segments = path.split( '/' ).slice( 0, -1 )

  return segments.map( ( _, index ) => segments.slice( 0, index + 1 ).join( '/' ) )
}

const parentIds = ( nodes: TreeNode[] ): string[] => {
  return nodes.flatMap( ( node ) => {
    return node.children.length > 0 ? [ node.path, ...parentIds( node.children ) ] : []
  } )
}

const renderItems = ( nodes: TreeNode[] ): ReactElement[] => {
  return nodes.map( ( node ) => (
    <TreeItem
      key={ node.path }
      itemId={ node.path }
      aria-label={ node.isNew ? `${ node.name } (new)` : node.name }
      label={ (
        <>
          { node.name }
          { node.isNew && <Chip label="new" size="small" sx={ { ml: 1 } } /> }
        </>
      ) }
    >
      { node.children.length > 0 ? renderItems( node.children ) : undefined }
    </TreeItem>
  ) )
}

interface FolderTreeProps {
  nodes: TreeNode[]
  chosenPath: string
  newestPath: string | null
  isFiltering: boolean
  onSelect: ( path: string ) => void
}

export function FolderTree(
  { nodes, chosenPath, newestPath, isFiltering, onSelect }: FolderTreeProps,
): ReactElement {
  const shown = [ chosenPath, ...( newestPath === null ? [] : [ newestPath ] ) ]
  const [ expanded, setExpanded ] = useState( () => shown.flatMap( ancestorsOf ) )
  const [ seen, setSeen ] = useState( shown.join( '\n' ) )

  // Reveal the chosen folder and the newest one when either changes.
  if( seen !== shown.join( '\n' ) ) {
    setSeen( shown.join( '\n' ) )
    setExpanded( [ ...new Set( [ ...expanded, ...shown.flatMap( ancestorsOf ) ] ) ] )
  }

  return (
    <SimpleTreeView
      aria-label="Folders"
      expansionTrigger="iconContainer"
      selectedItems={ chosenPath === '' ? ROOT_ID : chosenPath }
      expandedItems={ isFiltering ? parentIds( nodes ) : expanded }
      onSelectedItemsChange={ ( _event, itemId ) => {
        if( itemId !== null ) {
          onSelect( itemId === ROOT_ID ? '' : itemId )
        }
      } }
      onExpandedItemsChange={ ( _event, itemIds ) => setExpanded( itemIds ) }
    >
      <TreeItem itemId={ ROOT_ID } label="Vault root" />
      { renderItems( nodes ) }
    </SimpleTreeView>
  )
}

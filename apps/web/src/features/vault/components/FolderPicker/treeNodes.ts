// Shared
import type { FolderNode } from '@atlas/shared'

export interface TreeNode {
  name: string
  path: string
  isNew: boolean
  children: TreeNode[]
}

const byName = ( a: TreeNode, b: TreeNode ): number => {
  return a.name.localeCompare( b.name, undefined, { sensitivity: 'base' } )
}

const toTree = ( nodes: FolderNode[] ): TreeNode[] => {
  return nodes.map( ( { name, path, children } ) => {
    return { name, path, isNew: false, children: toTree( children ) }
  } )
}

// Folders that exist only in the draft (not on disk yet) are added and marked as new.
export const withExtraFolders = ( folders: FolderNode[], extra: string[] ): TreeNode[] => {
  const roots = toTree( folders )

  for( const path of extra.filter( ( entry ) => entry !== '' ) ) {
    let level = roots
    let prefix = ''

    for( const segment of path.split( '/' ) ) {
      prefix = prefix === '' ? segment : `${ prefix }/${ segment }`
      let node = level.find( ( { name } ) => name === segment )

      if( node === undefined ) {
        node = { name: segment, path: prefix, isNew: true, children: [] }
        level.push( node )
        level.sort( byName )
      }

      level = node.children
    }
  }

  return roots
}

export const filterTree = ( nodes: TreeNode[], query: string ): TreeNode[] => {
  const needle = query.trim().toLowerCase()

  if( needle === '' ) {
    return nodes
  }

  return nodes.flatMap( ( node ) => {
    const children = filterTree( node.children, needle )

    return node.name.toLowerCase().includes( needle ) || children.length > 0
      ? [ { ...node, children } ]
      : []
  } )
}

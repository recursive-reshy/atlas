// Vitest
import { describe, expect, it } from 'vitest'
// Shared
import type { FolderNode } from '@atlas/shared'
// App
import { filterTree, withExtraFolders } from './treeNodes'

const folders: FolderNode[] = [
  {
    name: 'Learning',
    path: 'Learning',
    children: [
      { name: 'AI', path: 'Learning/AI', children: [] },
      { name: 'Rust', path: 'Learning/Rust', children: [] },
    ],
  },
  { name: 'Projects', path: 'Projects', children: [] },
]

const names = ( nodes: { name: string, children: unknown[] }[] ): string[] => {
  return nodes.map( ( node ) => node.name )
}

describe( 'withExtraFolders', () => {
  it( 'marks existing folders as not new', () => {
    const tree = withExtraFolders( folders, [ 'Learning/AI' ] )

    expect( tree[ 0 ]?.isNew ).toBe( false )
    expect( tree[ 0 ]?.children[ 0 ]?.isNew ).toBe( false )
  } )

  it( 'adds missing folders and their missing ancestors as new, in name order', () => {
    const tree = withExtraFolders( folders, [ 'Learning/Brand New/Deep', 'Archive' ] )

    expect( names( tree ) ).toEqual( [ 'Archive', 'Learning', 'Projects' ] )
    expect( tree[ 0 ]?.isNew ).toBe( true )
    const learning = tree[ 1 ]
    expect( names( learning?.children ?? [] ) ).toEqual( [ 'AI', 'Brand New', 'Rust' ] )
    const brandNew = learning?.children[ 1 ]
    expect( brandNew?.isNew ).toBe( true )
    expect( brandNew?.children[ 0 ] ).toMatchObject( {
      name: 'Deep',
      path: 'Learning/Brand New/Deep',
      isNew: true,
    } )
  } )

  it( 'ignores the vault root and duplicates', () => {
    const tree = withExtraFolders( folders, [ '', 'Archive', 'Archive' ] )

    expect( names( tree ) ).toEqual( [ 'Archive', 'Learning', 'Projects' ] )
  } )

  it( 'does not change the folders it was given', () => {
    withExtraFolders( folders, [ 'Learning/New' ] )

    expect( folders[ 0 ]?.children ).toHaveLength( 2 )
  } )
} )

describe( 'filterTree', () => {
  const tree = withExtraFolders( folders, [] )

  it( 'returns everything for a blank query', () => {
    expect( filterTree( tree, '  ' ) ).toEqual( tree )
  } )

  it( 'keeps matches case-insensitively, anywhere, with their ancestors', () => {
    const result = filterTree( tree, 'RUS' )

    expect( names( result ) ).toEqual( [ 'Learning' ] )
    expect( names( result[ 0 ]?.children ?? [] ) ).toEqual( [ 'Rust' ] )
  } )

  it( 'matches a top-level folder by name', () => {
    expect( names( filterTree( tree, 'proj' ) ) ).toEqual( [ 'Projects' ] )
  } )

  it( 'returns nothing when no folder matches', () => {
    expect( filterTree( tree, 'zzz' ) ).toEqual( [] )
  } )
} )

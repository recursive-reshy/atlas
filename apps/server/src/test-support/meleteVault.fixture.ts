// Node
import {
  cp,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export type MeleteVault = {
  // The folder that holds the vault (`config.vaultsPath`), the user's `vault_dir`, and their join
  vaultsPath: string
  vaultDir: string
  vaultPath: string
  outsidePath: string
  write: ( path: string, content: string ) => Promise< void >
  remove: ( path: string ) => Promise< void >
  move: ( from: string, to: string ) => Promise< void >
  // Another user's own copy of the vault, as a new folder next to it
  clone: ( vaultDir: string ) => Promise< void >
  cleanup: () => Promise< void >
}

export const GENERICS_NOTE = `---
title: Generics in TypeScript
tags: [typescript]
---

# Generics

A generic type takes other types as parameters.
`

export const CONDITIONAL_NOTE = `# Conditional types

A conditional type picks one of two types with \`extends\`.
`

export const OWNERSHIP_NOTE = `# Ownership

Each value in Rust has exactly one owner.
`

// A learning root with two subjects, plus everything a scan has to skip or ignore
export const createMeleteVault = async (): Promise< MeleteVault > => {
  const base = await realpath( await mkdtemp( join( tmpdir(), 'atlas-melete-' ) ) )
  const vaultDir = 'vault'
  const vaultPath = join( base, vaultDir )
  const outsidePath = join( base, 'outside' )

  const write = async ( path: string, content: string ): Promise< void > => {
    await mkdir( dirname( join( vaultPath, path ) ), { recursive: true } )
    await writeFile( join( vaultPath, path ), content )
  }

  await mkdir( outsidePath )
  await writeFile( join( outsidePath, 'secret.md' ), '# Secret\n' )

  await write( 'Learning/TypeScript/Generics.md', GENERICS_NOTE )
  await write( 'Learning/TypeScript/Advanced/Conditional Types.md', CONDITIONAL_NOTE )
  await write( 'Learning/TypeScript/.trash/Old.md', '# Old\n' )
  await write( 'Learning/TypeScript/diagram.png', 'png' )
  await write( 'Learning/Rust/Ownership.md', OWNERSHIP_NOTE )
  await write( 'Learning/.hidden/Hidden.md', '# Hidden\n' )
  await write( 'Learning/Loose.md', '# Loose\n' )
  await write( 'Inbox/Other.md', '# Other\n' )
  await write( '.obsidian/app.json', '{}' )

  await symlink(
    join( outsidePath, 'secret.md' ),
    join( vaultPath, 'Learning/TypeScript/Leak.md' ),
  )
  await symlink( outsidePath, join( vaultPath, 'Learning/TypeScript/Linked' ) )

  return {
    vaultsPath: base,
    vaultDir,
    vaultPath,
    outsidePath,
    write,
    remove: async ( path ) => rm( join( vaultPath, path ), { recursive: true, force: true } ),
    move: async ( from, to ) => {
      await mkdir( dirname( join( vaultPath, to ) ), { recursive: true } )
      await rename( join( vaultPath, from ), join( vaultPath, to ) )
    },
    clone: async ( cloneDir ) => {
      await cp( vaultPath, join( base, cloneDir ), { recursive: true, verbatimSymlinks: true } )
    },
    cleanup: async () => rm( base, { recursive: true, force: true } ),
  }
}

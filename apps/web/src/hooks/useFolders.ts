// Packages
import { useQuery } from '@tanstack/react-query'
// Shared
import type { FolderNode } from '@atlas/shared'
// App
import { listFolders } from '../api/vault.api'
import { vaultKeys } from '../lib/queryKeys'

export interface FoldersState {
  defaultFolder: string | null
  folders: FolderNode[]
  error: string | null
}

export function useFolders(): FoldersState {
  const { data, error } = useQuery( {
    queryKey: vaultKeys.folders,
    queryFn: listFolders,
  } )

  return {
    defaultFolder: data?.default_folder ?? null,
    folders: data?.folders ?? [],
    error: error === null ? null : error.message,
  }
}

// React
import type { ReactElement } from 'react'

export type AutosaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

export interface AutosaveState {
  note: string
  folder: string | null
  setNote: ( note: string ) => void
  setFolder: ( folder: string | null ) => void
  flush: () => Promise< boolean >
  status: AutosaveStatus
  message: string | null
  adoptServerNote: () => void
  cancelPending: () => void
  replaceNote: ( note: string ) => void
  markSaved: ( note: string ) => void
  guard: ReactElement
}

export interface Values {
  note: string
  folder: string | null
}

// Shared
import {
  SourceDocument,
  applyLockedProperties,
  lockedPropertiesFor,
  serializeNote,
} from '@atlas/shared'

interface NoteInput {
  title: string
  tags: string[]
  body: string
  document: SourceDocument
  created: string
}

export const formatNote = ( { title, tags, body, document, created }: NoteInput ): string => {
  const locked = lockedPropertiesFor( document, created )

  return serializeNote( applyLockedProperties(
    { properties: { title, ...locked, tags }, body: `${ body.trim() }\n` },
    locked,
  ) )
}

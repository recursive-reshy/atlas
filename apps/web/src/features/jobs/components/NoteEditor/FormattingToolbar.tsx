// React
import type { ReactElement } from 'react'
// Packages
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  ListsToggle,
  Separator,
  UndoRedo,
  useCellValue,
  viewMode$,
} from '@mdxeditor/editor'

// Only what Markdown can hold: no underline (it would be written as HTML), no check lists.
export function FormattingToolbar(): ReactElement | null {
  const mode = useCellValue( viewMode$ )

  if( mode !== 'rich-text' ) {
    return null
  }

  return (
    <>
      <Separator />
      <UndoRedo />
      <Separator />
      <BlockTypeSelect />
      <Separator />
      <BoldItalicUnderlineToggles options={ [ 'Bold', 'Italic' ] } />
      <Separator />
      <ListsToggle options={ [ 'bullet', 'number' ] } />
      <Separator />
      <CreateLink />
    </>
  )
}

// React
import { useState } from 'react'
import type { ReactElement } from 'react'
// Packages
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import List from '@mui/material/List'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
// Shared
import type { InboxItem, InboxItemRef } from '@atlas/shared'
// App
import { useDismissInbox } from '#src/hooks/useDismissInbox'
import { useInbox } from '#src/hooks/useInbox'
import { useSummarizeInbox } from '#src/hooks/useSummarizeInbox'
import { InboxRow } from './InboxRow'
import { SummarizeItemsDialog } from '../SummarizeItemsDialog'

const LIST_SX = { display: 'flex', flexDirection: 'column', gap: 1 } as const

// A feed item and an email can't share an id, but the kind is part of what the server needs.
const keyOf = ( { kind, id }: InboxItemRef ): string => `${ kind }:${ id }`

const toRef = ( { kind, id }: InboxItem ): InboxItemRef => ( { kind, id } )

export function Inbox(): ReactElement | null {
  const { items } = useInbox()
  const dismiss = useDismissInbox()
  const summarize = useSummarizeInbox()
  const [ selected, setSelected ] = useState< string[] >( [] )
  const [ summarizeRefs, setSummarizeRefs ] = useState< InboxItemRef[] | null >( null )
  const [ notice, setNotice ] = useState< string | null >( null )

  if( items.length === 0 && notice === null ) {
    return null
  }

  const selectedItems = items.filter( ( item ) => selected.includes( keyOf( item ) ) )
  const hasSelection = selectedItems.length > 0
  const isAllSelected = hasSelection && selectedItems.length === items.length

  const handleToggle = ( item: InboxItem ): void => {
    const key = keyOf( item )
    const keys = selectedItems.map( keyOf )

    setSelected( keys.includes( key )
      ? keys.filter( ( other ) => other !== key )
      : [ ...keys, key ] )
  }

  const handleDismiss = ( refs: InboxItemRef[] ): void => {
    dismiss.mutate( refs, { onSuccess: () => setSelected( [] ) } )
  }

  const handleCloseDialog = (): void => {
    setSummarizeRefs( null )
    summarize.reset()
  }

  return (
    <Stack component="section" spacing={ 1 } aria-labelledby="inbox-heading">
      { items.length > 0 && (
        <>
          <Typography id="inbox-heading" variant="h6" component="h3">
            { `Inbox (${ items.length })` }
          </Typography>
          <Stack direction="row" spacing={ 1 } sx={ { alignItems: 'center' } }>
            <Checkbox
              slotProps={ { input: { 'aria-label': 'Select all' } } }
              checked={ isAllSelected }
              indeterminate={ hasSelection && !isAllSelected }
              onChange={ () => setSelected( isAllSelected ? [] : items.map( keyOf ) ) }
            />
            <Button
              size="small"
              variant="contained"
              disabled={ !hasSelection }
              onClick={ () => setSummarizeRefs( selectedItems.map( toRef ) ) }
            >
              Summarize selected
            </Button>
            <Button
              size="small"
              disabled={ !hasSelection || dismiss.isPending }
              onClick={ () => handleDismiss( selectedItems.map( toRef ) ) }
            >
              Dismiss selected
            </Button>
          </Stack>
          { dismiss.isError && <Alert severity="error">{ dismiss.error.message }</Alert> }
          <List aria-label="Inbox items" disablePadding sx={ LIST_SX }>
            { items.map( ( item ) => (
              <InboxRow
                key={ keyOf( item ) }
                item={ item }
                isSelected={ selected.includes( keyOf( item ) ) }
                onToggle={ () => handleToggle( item ) }
                onSummarize={ () => setSummarizeRefs( [ toRef( item ) ] ) }
                onDismiss={ () => handleDismiss( [ toRef( item ) ] ) }
              />
            ) ) }
          </List>
        </>
      ) }
      { summarizeRefs !== null && (
        <SummarizeItemsDialog
          count={ summarizeRefs.length }
          isSubmitting={ summarize.isPending }
          error={ summarize.error?.message ?? null }
          onSubmit={ ( choices ) => {
            summarize.mutate( { items: summarizeRefs, ...choices }, {
              onSuccess: ( { failedTitles } ) => {
                setSelected( [] )
                handleCloseDialog()
                setNotice( failedTitles.length === 0
                  ? null
                  : `${ failedTitles.length } of ${ summarizeRefs.length } couldn't be summarized `
                    + `and stay in the inbox: ${ failedTitles.join( ', ' ) }` )
              },
            } )
          } }
          onCancel={ handleCloseDialog }
        />
      ) }
      <Snackbar
        open={ notice !== null }
        autoHideDuration={ 12_000 }
        onClose={ () => setNotice( null ) }
        anchorOrigin={ { vertical: 'bottom', horizontal: 'center' } }
      >
        <Alert severity="warning" onClose={ () => setNotice( null ) }>{ notice }</Alert>
      </Snackbar>
    </Stack>
  )
}

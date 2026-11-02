// Shared
import { ListInboxResponse, SummarizeInboxResponse } from '@atlas/shared'
import type {
  InboxItem,
  InboxItemRef,
  Job,
  SummarizeInboxBody,
} from '@atlas/shared'
// App
import { request, send } from './request'

const postJson = ( body: unknown ): RequestInit => {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  }
}

export const listInbox = async (): Promise< InboxItem[] > => {
  const { items } = await request( '/api/inbox', ListInboxResponse )
  return items
}

export const summarizeInbox = async ( body: SummarizeInboxBody ): Promise< Job[] > => {
  const { jobs } = await request( '/api/inbox/summarize', SummarizeInboxResponse, postJson( body ) )
  return jobs
}

export const dismissInbox = async ( items: InboxItemRef[] ): Promise< void > => {
  await send( '/api/inbox/dismiss', postJson( { items } ) )
}

// Shared
import { GetGmailAccountResponse, ListGmailLabelsResponse } from '@atlas/shared'
import type { GmailAccount, GmailLabel } from '@atlas/shared'
// App
import { request, send } from './request'

export const GMAIL_CONNECT_URL = '/api/gmail/connect'

export const getGmailAccount = async (): Promise< GmailAccount > => {
  const { account } = await request( '/api/gmail/account', GetGmailAccountResponse )
  return account
}

export const listGmailLabels = async (): Promise< GmailLabel[] > => {
  const { labels } = await request( '/api/gmail/labels', ListGmailLabelsResponse )
  return labels
}

export const disconnectGmail = async (): Promise< void > => {
  await send( '/api/gmail/disconnect', { method: 'POST' } )
}

export const jobKeys = {
  all: [ 'jobs' ] as const,
  detail: ( id: string ) => [ 'jobs', id ] as const,
  source: ( id: string ) => [ 'jobs', id, 'source' ] as const,
}

export const linkSuggestionKeys = {
  list: ( jobId: string ) => [ 'jobs', jobId, 'link-suggestions' ] as const,
}

export const vaultKeys = {
  folders: [ 'vault', 'folders' ] as const,
}

export const settingsKeys = {
  all: [ 'settings' ] as const,
}

export const modelKeys = {
  all: [ 'models' ] as const,
}

export const promptKeys = {
  profiles: [ 'prompt-profiles' ] as const,
  // Under the profiles key, so every prompt change that refreshes the profiles refreshes these.
  melete: [ 'prompt-profiles', 'melete' ] as const,
  versions: ( id: string ) => [ 'prompt-profiles', id, 'versions' ] as const,
}

export const feedKeys = {
  all: [ 'feeds' ] as const,
}

export const inboxKeys = {
  all: [ 'inbox' ] as const,
}

export const gmailKeys = {
  account: [ 'gmail', 'account' ] as const,
  labels: [ 'gmail', 'labels' ] as const,
  sources: [ 'gmail', 'sources' ] as const,
}

export const statusKeys = {
  all: [ 'status' ] as const,
  errors: ( kind: string, id: string ) => [ 'status', 'errors', kind, id ] as const,
}

export const meleteKeys = {
  all: [ 'melete' ] as const,
  today: [ 'melete', 'today' ] as const,
  subject: ( id: string ) => [ 'melete', 'subjects', id ] as const,
  // Under the subject key, so refreshing the subject refreshes its syllabus
  syllabus: ( id: string ) => [ 'melete', 'subjects', id, 'syllabus' ] as const,
  note: ( id: string ) => [ 'melete', 'notes', id ] as const,
  review: ( subjectId: string | null, conceptId: string | null = null ): readonly string[] => {
    const base = [ 'melete', 'review', subjectId ?? 'all' ] as const

    return conceptId === null ? base : [ ...base, 'concept', conceptId ] as const
  },
  gaps: ( id: string ) => [ 'melete', 'subjects', id, 'gaps' ] as const,
}

export const meKeys = {
  all: [ 'me' ] as const,
  vaults: [ 'me', 'vaults' ] as const,
}

export const adminKeys = {
  all: [ 'admin' ] as const,
  users: [ 'admin', 'users' ] as const,
  usage: ( month: string | null ) => [ 'admin', 'usage', month ?? 'current' ] as const,
}

export const themisKeys = {
  all: [ 'themis' ] as const,
  overview: ( period: string ) => [ 'themis', 'overview', period ] as const,
  goals: [ 'themis', 'goals' ] as const,
  goal: ( id: string ) => [ 'themis', 'goals', id ] as const,
}

export const calendarKeys = {
  all: [ 'calendar' ] as const,
}

// Name guard (ADR 0073, TRD 2.3): "mnemosyne" is the transcriber module's label and the name of a
// note tag and a default folder, nothing else. Any other match fails with its file and line.
// Adding to an allow-list below is a deliberate edit.
import { execFileSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )

// Whole files that may name Mnemosyne: history (past versions, ADRs 0001-0073), this release's
// planning docs.
const HISTORY = [
  /^docs\/v0\.(?!10\.0\/)\d+(\.\d+)?\//,
  /^docs\/v0\.10\.0\//,
  /^docs\/decisions\/(00[0-6]\d|007[0-3])-/,
  // 1.1 planning docs and its ADRs (0089 on) describe Mnemosyne as one of three modules
  /^docs\/v1\.1\.0\//,
  /^docs\/decisions\/(0089|009\d)-/,
  // 1.2 planning docs and ADR 0109 name Mnemosyne as a module
  /^docs\/v1\.2\.0\//,
  /^docs\/decisions\/(010[3-9])-/,
]

// Files that name the module (label), the `mnemosyne` tag or the `Mnemosyne` default folder, or
// the README / CLAUDE.md sentences that say what Mnemosyne is, and the tests of those.
const MODULE_TAG_FOLDER = new Set( [
  '.env.example',
  'CLAUDE.md',
  'README.md',
  'apps/server/.env.example',
  'docs/configuration.md',
  'apps/server/src/clients/vault.client.test.ts',
  'apps/server/src/config.test.ts',
  'apps/server/src/config.ts',
  'apps/server/src/formatters/note.formatter.test.ts',
  'apps/server/src/formatters/summary.cleanup.test.ts',
  'apps/server/src/formatters/summary.cleanup.ts',
  'apps/server/src/repositories/jobStore.repository.test.ts',
  'apps/server/src/routes/jobs.routes.test.ts',
  'apps/server/src/routes/vault.routes.test.ts',
  'apps/server/src/routes/web.routes.test.ts',
  'apps/server/src/services/jobDraft.service.test.ts',
  'apps/server/src/services/jobLinking.service.test.ts',
  'apps/server/src/services/jobRender.service.test.ts',
  'apps/server/src/services/jobs.service.test.ts',
  'apps/server/src/sources/article.adapter.test.ts',
  'apps/server/src/sources/video.adapter.test.ts',
  'apps/server/src/worker/linkJob.test.ts',
  'apps/server/src/worker/summarizeJob.test.ts',
  'apps/web/src/features/jobs/api/jobs.api.test.ts',
  'apps/web/src/features/vault/api/vault.api.test.ts',
  'apps/web/src/features/admin/components/AddUserDialog/AddUserDialog.test.tsx',
  'apps/web/src/features/admin/components/AdminTab/AdminTab.test.tsx',
  'apps/web/src/app/AppShell/AppShell.test.tsx',
  'apps/web/src/features/jobs/components/FilenamePreview/FilenamePreview.test.tsx',
  'apps/web/src/features/vault/components/FolderPicker/FolderPicker.test.tsx',
  'apps/web/src/features/jobs/components/TranscriberHome/TranscriberHome.test.tsx',
  'apps/web/src/features/jobs/components/JobPage/JobPage.regenerate.test.tsx',
  'apps/web/src/features/jobs/components/JobPage/JobPage.test.tsx',
  'apps/web/src/features/melete/components/LearningRootSetup/LearningRootSetup.test.tsx',
  'apps/web/src/app/NavDrawer/NavDrawer.test.tsx',
  'apps/web/src/app/NavDrawer/NavDrawer.tsx',
  'apps/web/src/features/jobs/components/NoteDestination/NoteDestination.test.tsx',
  'apps/web/src/features/jobs/components/PropertiesPanel/PropertiesPanel.test.tsx',
  'apps/web/src/features/jobs/components/PropertiesPanel/PropertiesPanel.tsx',
  'apps/web/src/features/jobs/components/ReviewScreen/ReviewScreen.browser.test.tsx',
  'apps/web/src/features/jobs/components/ReviewScreen/ReviewScreen.links.test.tsx',
  'apps/web/src/features/jobs/components/ReviewScreen/ReviewScreen.test.tsx',
  'apps/web/src/features/jobs/components/TagInput/TagInput.test.tsx',
  'apps/web/src/features/jobs/components/TagInput/TagInput.tsx',
  'apps/web/src/features/admin/components/UserCard/UserCard.test.tsx',
  'apps/web/src/features/vault/hooks/useFolders.test.ts',
  'apps/web/src/features/jobs/hooks/useRemoveLegacyDrafts.test.ts',
  'apps/web/src/features/jobs/hooks/useRemoveLegacyDrafts.ts',
  'apps/web/src/features/jobs/hooks/useSaveJob.test.ts',
  'apps/web/src/app/moduleLabels.ts',
  'apps/web/src/features/jobs/fixtures/job.fixture.ts',
  'apps/web/src/test-support/noteFixtures.ts',
  'e2e/tests/multi-user.spec.ts',
  'packages/shared/src/api.test.ts',
  'packages/shared/src/job.test.ts',
  'packages/shared/src/note.test.ts',
  'packages/shared/src/note.ts',
  'scripts/hostingDocs.test.mjs',
] )

// The app's old name must not survive in these shapes anywhere outside history, even in the
// files above. Each exception is one line that is meant to say it.
const OLD_APP_NAME = /@mnemosyne|mnemosyne[-_.]|mnemosyne:(?!draft:)|Mnemosyne's|(of|from) Mnemosyne/
const EXCEPTIONS = [
  { file: 'README.md', line: /mnemosyne_mnemosyne-data|Upgrading from Mnemosyne/ },
]

const matches = () => {
  let output = ''

  try {
    output = execFileSync( 'git', [ 'grep', '-n', '-i', 'mnemosyne' ], {
      cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    } )
  } catch {
    return []
  }

  return output.split( '\n' ).filter( Boolean ).map( ( entry ) => {
    const [ file, line, ...text ] = entry.split( ':' )

    return { file, line: Number( line ), text: text.join( ':' ) }
  } )
}

test( 'Mnemosyne is named only where ADR 0073 allows it', () => {
  const stray = matches()
    .filter( ( { file } ) => !HISTORY.some( ( pattern ) => pattern.test( file ) ) )
    .filter( ( { file, text } ) => {
      if( file === 'scripts/nameGuard.test.mjs' ) return false
      if( file === 'docs/README.md' ) return !/0073|Atlas/.test( text )
      if( EXCEPTIONS.some( ( e ) => e.file === file && e.line.test( text ) ) ) return false
      if( OLD_APP_NAME.test( text ) ) return true

      return !MODULE_TAG_FOLDER.has( file )
    } )

  assert.deepEqual(
    stray.map( ( { file, line, text } ) => `${ file }:${ line }: ${ text.trim().slice( 0, 100 ) }` ),
    [],
  )
} )

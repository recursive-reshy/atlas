// Packages
import type { RouteObject } from 'react-router'
// App
import { App } from './App'
import { AdminTab } from './features/admin/components/AdminTab'
import { AuthGate } from './app/AuthGate'
import { HomePage } from './features/jobs/components/HomePage'
import { HomeRedirect } from './app/HomeRedirect'
import { JobPage } from './features/jobs/components/JobPage'
import { MeleteNote } from './features/melete/components/MeleteNote'
import { MeleteReview } from './features/melete/components/MeleteReview'
import { MeleteSubject } from './features/melete/components/MeleteSubject'
import { MeleteToday } from './features/melete/components/MeleteToday'
import { ModelsTab } from './features/settings/components/ModelsTab'
import { PromptsTab } from './features/settings/components/PromptsTab'
import { RequireModule } from './app/RequireModule'
import { SettingsIndexRedirect } from './features/settings/components/SettingsIndexRedirect'
import { SettingsLayout } from './features/settings/components/SettingsLayout'
import { SignInPage } from './app/SignInPage'
import { SourcesTab } from './features/settings/components/SourcesTab'
import { ThemisGoal } from './components/ThemisGoal'
import { ThemisHome } from './components/ThemisHome'

export const routes: RouteObject[] = [
  { path: '/signin', element: <SignInPage /> },
  {
    path: '/',
    element: <AuthGate />,
    children: [
      {
        element: <App />,
        children: [
          {
            element: <RequireModule module="themis" />,
            children: [
              { path: 'themis', element: <ThemisHome /> },
              { path: 'themis/goals/:goalId', element: <ThemisGoal /> },
            ],
          },
          {
            element: <RequireModule module="transcriber" />,
            children: [
              { index: true, element: <HomePage /> },
              { path: 'jobs/:id', element: <JobPage /> },
            ],
          },
          {
            element: <RequireModule module="melete" />,
            children: [
              { path: 'melete', element: <MeleteToday /> },
              { path: 'melete/subjects/:subjectId', element: <MeleteSubject /> },
              { path: 'melete/notes/:noteId', element: <MeleteNote /> },
              { path: 'melete/review', element: <MeleteReview /> },
            ],
          },
          {
            path: 'settings',
            element: <SettingsLayout />,
            children: [
              { index: true, element: <SettingsIndexRedirect /> },
              { path: 'prompts', element: <PromptsTab /> },
              { path: 'prompts/:promptId', element: <PromptsTab /> },
              { path: 'models', element: <ModelsTab /> },
              { path: 'sources', element: <SourcesTab /> },
              { path: 'admin', element: <AdminTab /> },
              { path: '*', element: <SettingsIndexRedirect /> },
            ],
          },
          { path: '*', element: <HomeRedirect /> },
        ],
      },
    ],
  },
]

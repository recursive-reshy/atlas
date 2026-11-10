// Packages
import type { RouteObject } from 'react-router'
// App
import { App } from './App'
import { AdminTab } from './components/AdminTab'
import { AuthGate } from './app/AuthGate'
import { HomePage } from './components/HomePage'
import { HomeRedirect } from './app/HomeRedirect'
import { JobPage } from './components/JobPage'
import { MeleteNote } from './components/MeleteNote'
import { MeleteReview } from './components/MeleteReview'
import { MeleteSubject } from './components/MeleteSubject'
import { MeleteToday } from './components/MeleteToday'
import { ModelsTab } from './components/ModelsTab'
import { PromptsTab } from './components/PromptsTab'
import { RequireModule } from './app/RequireModule'
import { SettingsIndexRedirect } from './components/SettingsIndexRedirect'
import { SettingsLayout } from './components/SettingsLayout'
import { SignInPage } from './app/SignInPage'
import { SourcesTab } from './components/SourcesTab'
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

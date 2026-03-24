import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { ThemeProvider } from './components/ThemeProvider'
import { supabase } from './lib/supabase'
import { ThemeToggle } from './components/ThemeToggle'
import AuthGuard from './components/AuthGuard'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import ProjectsPage from './pages/ProjectsPage'
import CreateProjectPage from './pages/CreateProjectPage'
import ProjectWorkspacePage from './pages/ProjectWorkspacePage'
import CreateAgentPage from './pages/CreateAgentPage'
import AgentDetailPage from './pages/AgentDetailPage'
import TerminalPage from './pages/TerminalPage'
import EditProjectPage from './pages/EditProjectPage'

function OAuthCallbackHandler() {
  const navigate = useNavigate()

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.onAuthCallback) return

    const unsub = api.onAuthCallback(async (url: string) => {
      // Extract the `code` query param from the deep-link URL
      // e.g. dispatch://auth/callback?code=XXXX
      const parsed = new URL(url)
      const code = parsed.searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) navigate('/projects')
      }
    })

    return unsub
  }, [navigate])

  return null
}

export default function App() {
  return (
    <ThemeProvider>
      <>
        <OAuthCallbackHandler />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<AuthGuard />}>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/new" element={<CreateProjectPage />} />
            <Route path="/projects/:id" element={<ProjectWorkspacePage />} />
            <Route path="/projects/:id/edit" element={<EditProjectPage />} />
            <Route path="/projects/:id/agents/new" element={<CreateAgentPage />} />
            <Route path="/projects/:id/agents/:agentId" element={<AgentDetailPage />} />
            <Route path="/projects/:id/agents/:agentId/terminal" element={<TerminalPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
        <ThemeToggle />
      </>
    </ThemeProvider>
  )
}

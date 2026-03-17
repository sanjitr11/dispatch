import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import ProjectForm from '../components/ProjectForm'
import type { ProjectFormData } from '../lib/types'

export default function CreateProjectPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(data: ProjectFormData) {
    setLoading(true)
    setError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('Not authenticated — please sign in again.')
      setLoading(false)
      return
    }

    const { data: rows, error } = await supabase.from('projects').insert({
      ...data,
      user_id: user.id,
    }).select('id')

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate(`/projects/${rows[0].id}`)
    }
  }

  return (
    <div className="min-h-screen bg-surface-base">
      <header className="bg-surface-raised border-b border-surface-border px-6 py-3 flex items-center gap-3">
        <Link
          to="/projects"
          className="text-sm text-ink-3 hover:text-ink transition-colors"
        >
          ← Back
        </Link>
        <h1 className="text-sm font-semibold text-ink">New Project</h1>
      </header>

      <main className="max-w-xl mx-auto px-6 py-10">
        <p className="text-sm text-ink-2 mb-6">
          Fill in your startup context. This powers your agent environment — the more
          specific you are, the better your agents perform.
        </p>
        <ProjectForm
          onSubmit={handleSubmit}
          loading={loading}
          error={error}
          submitLabel="Create project"
        />
      </main>
    </div>
  )
}

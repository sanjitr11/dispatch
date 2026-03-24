import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { OAuthButtons } from '../components/OAuthButtons'

export default function SignupPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else if (data.session) {
      navigate('/projects')
    } else {
      setMessage('Check your email to confirm your account, then sign in.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base">
      <div className="w-full max-w-sm space-y-6 p-8 bg-bg-subtle rounded-xl border border-border shadow-md">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-text-primary">Dispatch</h1>
          <p className="text-sm text-text-muted mt-1">Create your account</p>
        </div>

        {message ? (
          <div className="text-sm text-success bg-success-subtle rounded-md px-4 py-3 text-center">
            {message}
          </div>
        ) : (
          <>
          <OAuthButtons onError={setError} />

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-muted">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                required
                minLength={6}
              />
            </div>

            {error && (
              <p className="text-sm text-error bg-error-subtle rounded-md px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-accent-text py-2.5 rounded-lg font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
          </>
        )}

        <p className="text-sm text-center text-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:opacity-70 font-medium transition-opacity">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

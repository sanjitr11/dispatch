import { useState } from 'react'
import { supabase } from '../lib/supabase'

type Provider = 'google' | 'github' | 'apple'

interface Props {
  onError: (message: string) => void
}

async function signInWithProvider(provider: Provider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: 'dispatch://auth/callback',
      skipBrowserRedirect: true,
    },
  })
  if (error) throw error
  if (data?.url) {
    await (window as any).electronAPI.openExternal(data.url)
  }
}

const PROVIDERS: { id: Provider; label: string; icon: React.ReactNode }[] = [
  {
    id: 'google',
    label: 'Google',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
      </svg>
    ),
  },
  {
    id: 'github',
    label: 'GitHub',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12Z"/>
      </svg>
    ),
  },
  {
    id: 'apple',
    label: 'Apple',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09ZM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701Z"/>
      </svg>
    ),
  },
]

export function OAuthButtons({ onError }: Props) {
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null)

  async function handleClick(provider: Provider) {
    setLoadingProvider(provider)
    try {
      await signInWithProvider(provider)
      // Navigation happens in App.tsx once the deep-link callback fires
    } catch (err: any) {
      onError(err.message ?? 'OAuth sign-in failed')
      setLoadingProvider(null)
    }
  }

  return (
    <div className="space-y-2">
      {PROVIDERS.map(({ id, label, icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => handleClick(id)}
          disabled={loadingProvider !== null}
          className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg border border-border bg-bg-base text-text-primary text-sm font-medium hover:bg-bg-subtle disabled:opacity-50 transition-colors"
        >
          {icon}
          {loadingProvider === id ? `Opening ${label}...` : `Continue with ${label}`}
        </button>
      ))}
    </div>
  )
}

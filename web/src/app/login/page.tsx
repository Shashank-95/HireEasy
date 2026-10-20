import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const sp = await searchParams
  const next = typeof sp.next === 'string' ? sp.next : '/'
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-solid text-lg font-bold text-white">H</div>
          <h1 className="text-xl font-semibold tracking-tight">HireEasy</h1>
          <p className="mt-1 text-sm text-muted">Hiring on autopilot, until your final round.</p>
        </div>
        <LoginForm next={next} />
        <p className="mt-6 text-center text-[12px] text-faint">The first person to sign up becomes the admin.</p>
      </div>
    </main>
  )
}

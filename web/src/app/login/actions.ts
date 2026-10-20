'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export interface AuthState {
  error?: string
  mode: 'signin' | 'signup'
}

// Same-site paths only: "//x" and "/\\x" are read by browsers as other sites
const safeNext = (next: string | null) => (next && /^\/(?![\/\\])/.test(next) && !/[\\\s]/.test(next) ? next : '/')

export async function authenticate(prev: AuthState, form: FormData): Promise<AuthState> {
  const mode = (form.get('mode') as AuthState['mode']) || 'signin'
  const email = String(form.get('email') || '').trim().toLowerCase()
  const password = String(form.get('password') || '')
  const fullName = String(form.get('fullName') || '').trim()

  if (!/\S+@\S+\.\S+/.test(email)) return { mode, error: 'Enter a valid email address.' }
  if (password.length < 8) return { mode, error: 'Password must be at least 8 characters.' }
  if (mode === 'signup' && !fullName) return { mode, error: 'Enter your name so teammates know who made a decision.' }

  const supabase = await createClient()
  if (mode === 'signup') {
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
    if (error) return { mode, error: error.message.includes('already') ? 'That email already has an account — sign in instead.' : error.message }
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { mode, error: 'Email or password is incorrect.' }
  }
  redirect(safeNext(form.get('next') as string | null))
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

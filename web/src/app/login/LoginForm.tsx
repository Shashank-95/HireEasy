'use client'
import { useActionState, useState } from 'react'
import { authenticate, type AuthState } from './actions'
import { Button, Card, Field, Input, Notice } from '@/components/ui'
import { KeepForm } from '@/components/KeepForm'

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<AuthState['mode']>('signin')
  const [state, action, pending] = useActionState(authenticate, { mode: 'signin' })

  return (
    <Card className="p-6">
      <div className="mb-5 grid grid-cols-2 rounded-lg bg-surface-2 p-1 text-sm font-medium">
        {(['signin', 'signup'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md py-1.5 transition-colors ${mode === m ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          >
            {m === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>
      <KeepForm action={action} className="space-y-4">
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="next" value={next} />
        {mode === 'signup' && (
          <Field label="Your name">
            <Input name="fullName" autoComplete="name" placeholder="Priya Sharma" required />
          </Field>
        )}
        <Field label="Work email">
          <Input name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
        </Field>
        <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
          <Input name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required />
        </Field>
        {state.error && state.mode === mode && <Notice tone="danger">{state.error}</Notice>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
      </KeepForm>
    </Card>
  )
}

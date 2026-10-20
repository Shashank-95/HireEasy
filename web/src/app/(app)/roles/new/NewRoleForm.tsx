'use client'
import { useActionState, useState } from 'react'
import { createRoleAction } from '../actions'
import { Button, Card, cx, Field, Input, Notice, Textarea } from '@/components/ui'
import { KeepForm } from '@/components/KeepForm'

interface T {
  id: string
  name: string
  family: string
  description: string
  title: string
}

export function NewRoleForm({ templates }: { templates: T[] }) {
  const [state, action, pending] = useActionState(createRoleAction, {})
  const [picked, setPicked] = useState(templates[0]?.id ?? '')
  const [title, setTitle] = useState(templates[0]?.title ?? '')

  return (
    <KeepForm action={action} className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold">1. Template</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setPicked(t.id)
                setTitle(t.title)
              }}
              className={cx(
                'rounded-xl border bg-surface p-4 text-left transition-colors',
                picked === t.id ? 'border-accent ring-4 ring-[var(--ring)]' : 'border-line hover:border-accent/40',
              )}
            >
              <p className="text-[12px] font-medium text-accent">{t.family}</p>
              <p className="mt-0.5 font-semibold">{t.name}</p>
              <p className="mt-1 text-[13px] text-muted">{t.description}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">Need a different kind of role? Create one under Templates — any role can follow the same structure.</p>
        <input type="hidden" name="templateId" value={picked} />
      </section>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold">2. About this opening</h2>
        <Field label="Job title" hint="As candidates will see it.">
          <Input name="title" value={title} onChange={e => setTitle(e.target.value)} required />
        </Field>
        <Field
          label="Original job description (optional)"
          hint="Paste the JD you already have. It's kept next to the structured version so anyone can see what was changed and why."
        >
          <Textarea name="sourceJd" rows={6} placeholder="Paste the JD text here…" />
        </Field>
      </Card>

      {state.error && <Notice tone="danger">{state.error}</Notice>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !picked}>
          {pending ? 'Creating…' : 'Create role and continue to setup'}
        </Button>
      </div>
    </KeepForm>
  )
}

'use client'
import { useActionState } from 'react'
import { createTemplateAction } from './actions'
import { Button, Card, CardHeader, Field, Input, Notice, Select } from '@/components/ui'
import { KeepForm } from '@/components/KeepForm'

export function NewTemplate({ templates }: { templates: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createTemplateAction, {})
  return (
    <Card className="h-fit">
      <CardHeader title="New template" description="For a kind of role you hire for repeatedly — designer, marketer, intern…" />
      <KeepForm action={action} className="space-y-4 p-5">
        <Field label="Name"><Input name="name" placeholder="Design — Product Designer" required /></Field>
        <Field label="Family" hint="Groups templates, e.g. Design, Marketing."><Input name="family" placeholder="Design" /></Field>
        <Field label="Start from">
          <Select name="from" defaultValue="">
            <option value="">Blank structure</option>
            {templates.map(t => <option key={t.id} value={t.id}>Copy of {t.name}</option>)}
          </Select>
        </Field>
        {state.error && <Notice tone="danger">{state.error}</Notice>}
        <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Creating…' : 'Create template'}</Button>
      </KeepForm>
    </Card>
  )
}

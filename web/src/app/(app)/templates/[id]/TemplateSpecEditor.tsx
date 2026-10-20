'use client'
import { useState } from 'react'
import { SpecEditor } from '@/components/spec/SpecEditor'
import type { RoleSpec } from '@/lib/templates/types'
import { saveTemplateSpecAction } from '../actions'
import { Card, Field, Input } from '@/components/ui'

export function TemplateSpecEditor({ id, meta, initial, readOnly = false }: { id: string; meta: { name: string; family: string; description: string }; initial: RoleSpec; readOnly?: boolean }) {
  const [m, setM] = useState(meta)
  const [savedMeta, setSavedMeta] = useState(meta)
  const metaDirty = JSON.stringify(m) !== JSON.stringify(savedMeta)
  return (
    <div className="space-y-6">
      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Template name"><Input value={m.name} disabled={readOnly} onChange={e => setM({ ...m, name: e.target.value })} /></Field>
        <Field label="Family"><Input value={m.family} disabled={readOnly} onChange={e => setM({ ...m, family: e.target.value })} /></Field>
        <Field label="Description"><Input value={m.description} disabled={readOnly} onChange={e => setM({ ...m, description: e.target.value })} /></Field>
      </Card>
      <p className="text-[13px] text-muted">Budget and interviewer emails are left blank in templates on purpose — each role fills them in.</p>
      <SpecEditor
        forTemplate
        readOnly={readOnly}
        initial={initial}
        extraDirty={metaDirty}
        onDiscard={() => setM(savedMeta)}
        onSave={async spec => {
          const r = await saveTemplateSpecAction(id, m, spec)
          if (!r.error) setSavedMeta(m)
          return r
        }}
      />
    </div>
  )
}

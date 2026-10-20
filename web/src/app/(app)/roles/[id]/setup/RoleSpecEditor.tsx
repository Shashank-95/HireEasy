'use client'
import { SpecEditor } from '@/components/spec/SpecEditor'
import type { RoleSpec } from '@/lib/templates/types'
import { saveSpecAction } from '../../actions'

export function RoleSpecEditor({ roleId, initial, readOnly = false }: { roleId: string; initial: RoleSpec; readOnly?: boolean }) {
  return <SpecEditor initial={initial} readOnly={readOnly} onSave={spec => saveSpecAction(roleId, spec)} />
}

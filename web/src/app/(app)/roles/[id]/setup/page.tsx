import type { Metadata } from 'next'

import { canManageRoles } from '@/lib/auth'
import { getRoleForPage } from '@/lib/data/roles'
import { db } from '@/lib/supabase/server'
import { applicationFormFor } from '@/lib/templates/applicationForm'
import { Badge, Card, CardHeader, Notice } from '@/components/ui'
import { RoleSpecEditor } from './RoleSpecEditor'
import { TeamCard } from './TeamCard'

export const metadata: Metadata = { title: 'Setup' }

export default async function SetupPage({ params }: PageProps<'/roles/[id]/setup'>) {
  const { id } = await params
  const { me, role } = await getRoleForPage(id)

  const { data: members } = await db().from('role_members').select('user_id, member_role, profiles(full_name, email)').eq('role_id', id)
  const form = applicationFormFor(role.spec)

  return (
    <div className="space-y-6">
      {role.versionLocked && (
        <Notice tone="info" title={`Version ${role.current_version} is locked by calibration`}>
          Saving changes creates version {role.current_version + 1}. Scores already given stay tied to this version, and autopilot pauses until the new answer keys are re-checked.
        </Notice>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {role.change_notes.length > 0 && (
          <Card>
            <CardHeader title="What we changed from the original JD" description="The template restructures the JD so every role is scored the same way. Nothing is changed silently." />
            <ul className="divide-y divide-line">
              {role.change_notes.map((n, i) => (
                <li key={i} className="px-5 py-3 text-[13px]">
                  <Badge tone="accent">{n.section}</Badge>
                  <p className="mt-1.5 text-ink">{n.change}</p>
                  <p className="mt-0.5 text-muted">Why: {n.why}</p>
                </li>
              ))}
            </ul>
            {role.source_jd && (
              <details className="border-t border-line px-5 py-3 text-[13px]">
                <summary className="cursor-pointer font-medium">Original JD as pasted</summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap font-sans text-muted">{role.source_jd}</pre>
              </details>
            )}
          </Card>
        )}

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Application form"
              description="Build these fields in Typeform, in this order. The form tool's own validation stops bad values (like “as per norms” for salary) before they reach us."
            />
            <ol className="max-h-96 divide-y divide-line overflow-y-auto">
              {form.map((f, i) => (
                <li key={i} className="px-5 py-2.5 text-[13px]">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-ink">{i + 1}. {f.label.length > 140 ? f.label.slice(0, 140) + '…' : f.label}</p>
                    <Badge>{f.type}</Badge>
                  </div>
                  {(f.settings || f.helpText) && (
                    <p className="mt-0.5 text-muted">
                      {f.required ? 'Required' : 'Optional'}
                      {f.settings ? ` · ${f.settings}` : ''}
                      {f.helpText ? ` · Help text: “${f.helpText}”` : ''}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Card>
          <TeamCard
            roleId={id}
            canEdit={canManageRoles(me)}
            members={(members ?? []).map(m => {
              const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as { full_name: string; email: string } | null
              return { userId: m.user_id, role: m.member_role, name: p?.full_name || p?.email || 'Unknown', email: p?.email ?? '' }
            })}
          />
        </div>
      </div>

      <RoleSpecEditor roleId={id} initial={role.spec} readOnly={role.status === 'closed'} />
    </div>
  )
}

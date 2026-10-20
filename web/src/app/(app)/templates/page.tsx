import type { Metadata } from 'next'
import Link from 'next/link'
import { listTemplates } from '@/lib/data/roles'
import { canManageRoles, requireMe } from '@/lib/auth'
import { checkReadiness } from '@/lib/templates/readiness'
import { Badge, Card, PageHeader } from '@/components/ui'
import { NewTemplate } from './NewTemplate'

export const metadata: Metadata = { title: 'Templates' }

export default async function TemplatesPage() {
  const [me, templates] = await Promise.all([requireMe(), listTemplates()])
  return (
    <>
      <PageHeader
        title="Templates"
        description="Every role follows the same structure — skills tied to where they're checked, screening questions with answer keys, an interview plan. A template is a ready-made starting point; a role takes its own copy."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-3 sm:grid-cols-2">
          {templates.map(t => {
            const issues = checkReadiness(t.spec, { forTemplate: true }).filter(i => i.severity === 'block').length
            return (
              <Link key={t.id} href={`/templates/${t.id}`}>
                <Card className="h-full p-5 transition-colors hover:border-accent/40">
                  <p className="text-[12px] font-medium text-accent">{t.family}</p>
                  <p className="mt-0.5 font-semibold">{t.name}</p>
                  <p className="mt-1 text-[13px] text-muted">{t.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge>{t.spec.mustHaves.length} must-haves</Badge>
                    <Badge>{t.spec.screeningQuestions.length} questions</Badge>
                    <Badge>{t.spec.interviewRounds.length} rounds</Badge>
                    {t.calibrated && <Badge tone="success">Calibrated</Badge>}
                    {issues > 0 && <Badge tone="warn">{issues} to finish</Badge>}
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
        {canManageRoles(me) && <NewTemplate templates={templates.map(t => ({ id: t.id, name: t.name }))} />}
      </div>
    </>
  )
}

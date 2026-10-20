import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTemplate } from '@/lib/data/roles'
import { canManageRoles, requireMe } from '@/lib/auth'
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui'
import { TemplateSpecEditor } from './TemplateSpecEditor'

export const metadata: Metadata = { title: 'Template' }

export default async function TemplatePage({ params }: PageProps<'/templates/[id]'>) {
  const { id } = await params
  const [me, t] = await Promise.all([requireMe(), getTemplate(id)])
  if (!t) notFound()
  return (
    <>
      <PageHeader back={{ href: '/templates', label: 'Templates' }} title={t.name} description="Changes here apply to roles created from now on. Existing roles keep their own copy." />
      {t.change_notes.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="How this template was built from the original JD" />
          <ul className="divide-y divide-line">
            {t.change_notes.map((n, i) => (
              <li key={i} className="px-5 py-3 text-[13px]"><Badge tone="accent">{n.section}</Badge><p className="mt-1.5">{n.change}</p><p className="mt-0.5 text-muted">Why: {n.why}</p></li>
            ))}
          </ul>
        </Card>
      )}
      <TemplateSpecEditor id={t.id} meta={{ name: t.name, family: t.family, description: t.description }} initial={t.spec} readOnly={!canManageRoles(me)} />
    </>
  )
}

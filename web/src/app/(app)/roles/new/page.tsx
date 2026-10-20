import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { canManageRoles, requireMe } from '@/lib/auth'
import { listTemplates } from '@/lib/data/roles'
import { HowItWorks, PageHeader } from '@/components/ui'
import { NewRoleForm } from './NewRoleForm'

export const metadata: Metadata = { title: 'New role' }

export default async function NewRolePage() {
  const me = await requireMe()
  if (!canManageRoles(me)) redirect('/')
  const templates = await listTemplates()
  return (
    <>
      <PageHeader title="New role" back={{ href: '/', label: 'Roles' }} description="Pick the template closest to the job. You'll adjust skills, questions, budget and interview rounds on the next screen." />
      <HowItWorks
        steps={[
          'Pick a template — it brings a ready structure: skills, screening questions with answer keys, and an interview plan.',
          'Enter the budget, experience range and who takes the final round. The checklist tells you exactly what is missing.',
          'Add the Google Sheet of applications. HireEasy screens, interviews and shortlists on its own from there.',
        ]}
      />
      <NewRoleForm templates={templates.map(t => ({ id: t.id, name: t.name, family: t.family, description: t.description, title: t.spec.basics.title }))} />
    </>
  )
}

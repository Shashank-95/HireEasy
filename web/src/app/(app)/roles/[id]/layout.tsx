import { notFound } from 'next/navigation'
import { canAccessRole, canManageRoles, requireMe } from '@/lib/auth'
import { getRole } from '@/lib/data/roles'
import { checkReadiness } from '@/lib/templates/readiness'
import { db } from '@/lib/supabase/server'
import { Badge, PageHeader } from '@/components/ui'
import { RoleTabs } from './RoleTabs'
import { RoleStatusControl } from './RoleStatusControl'

export default async function RoleLayout({ children, params }: LayoutProps<'/roles/[id]'>) {
  const { id } = await params
  const me = await requireMe()
  if (!(await canAccessRole(me, id))) notFound()
  const role = await getRole(id)
  if (!role) notFound()

  const blocks = checkReadiness(role.spec).filter(i => i.severity === 'block').length
  const { count: review } = await db().from('candidates').select('id', { count: 'exact', head: true }).eq('role_id', id).eq('status', 'review').is('merged_into', null)

  return (
    <>
      <PageHeader
        back={{ href: '/', label: 'Roles' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {role.title}
            {role.autopilot && <Badge tone="accent">Autopilot on</Badge>}
          </span>
        }
        description={`${role.spec.basics.team} · ${role.spec.basics.workMode === 'remote' ? 'Remote' : role.spec.basics.city || role.spec.basics.workMode} · version ${role.current_version}`}
        // Going live, pausing and closing are HR decisions
        actions={canManageRoles(me) ? <RoleStatusControl roleId={id} status={role.status} blocked={blocks} /> : <Badge>{role.status === 'active' ? 'Live' : role.status === 'paused' ? 'Paused' : role.status === 'closed' ? 'Closed' : 'Draft'}</Badge>}
      />
      <RoleTabs id={id} setupIssues={blocks} review={review ?? 0} />
      {children}
    </>
  )
}

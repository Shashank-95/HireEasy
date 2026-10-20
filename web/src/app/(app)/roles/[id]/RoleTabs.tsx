'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Badge, TabLinks } from '@/components/ui'

export function RoleTabs({ id, setupIssues, review }: { id: string; setupIssues: number; review: number }) {
  const path = usePathname()
  const base = `/roles/${id}`
  const tabs = [
    { key: 'overview', href: base, label: 'Overview' },
    { key: 'setup', href: `${base}/setup`, label: 'Setup', badge: setupIssues ? <Badge tone="danger">{setupIssues}</Badge> : undefined },
    { key: 'applicants', href: `${base}/applicants`, label: 'Applicants', badge: review ? <Badge tone="warn">{review}</Badge> : undefined },
    { key: 'calibration', href: `${base}/calibration`, label: 'Calibration' },
    { key: 'interviews', href: `${base}/interviews`, label: 'Interviews' },
    { key: 'report', href: `${base}/report`, label: 'Shortlist report' },
    { key: 'emails', href: `${base}/emails`, label: 'Emails' },
    { key: 'activity', href: `${base}/activity`, label: 'Activity' },
  ]
  const active = tabs.find(t => t.key !== 'overview' && path.startsWith(t.href))?.key ?? 'overview'
  // On a phone the tab strip scrolls: keep the current tab in view
  useEffect(() => {
    document.querySelector('[data-tabs] [aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [active])
  return <TabLinks tabs={tabs} active={active} />
}

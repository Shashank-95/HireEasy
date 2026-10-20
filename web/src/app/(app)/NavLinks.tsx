'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Briefcase, LayoutTemplate, Settings, Bell, MessageCircle, BookOpen } from 'lucide-react'
import { cx } from '@/components/ui'

const ITEMS = [
  { href: '/', label: 'Roles', icon: Briefcase, match: (p: string) => p === '/' || p.startsWith('/roles') },
  { href: '/ask', label: 'Ask', icon: MessageCircle, match: (p: string) => p.startsWith('/ask') },
  { href: '/inbox', label: 'Inbox', icon: Bell, match: (p: string) => p.startsWith('/inbox') },
  { href: '/templates', label: 'Templates', icon: LayoutTemplate, match: (p: string) => p.startsWith('/templates') },
  { href: '/settings', label: 'Settings', icon: Settings, match: (p: string) => p.startsWith('/settings') },
  // Phones reach the guide from the top bar, so the bottom tabs stay at five
  { href: '/guide', label: 'How it works', icon: BookOpen, match: (p: string) => p.startsWith('/guide'), sidebarOnly: true },
]

export function NavLinks({ variant }: { variant: 'sidebar' | 'tabs'; isManager: boolean }) {
  const path = usePathname()
  if (variant === 'tabs') {
    return (
      <div className="grid grid-cols-5">
        {ITEMS.filter(i => !i.sidebarOnly).map(({ href, label, icon: Icon, match }) => (
          <Link
            key={href}
            href={href}
            // Inside a role, Ask opens the panel about this role or candidate instead of leaving the page
            onClick={e => {
              if (href === '/ask' && path.startsWith('/roles/')) {
                e.preventDefault()
                window.dispatchEvent(new Event('hireeasy:ask'))
              }
            }}
            className={cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', match(path) ? 'text-accent' : 'text-muted')}
          >
            <Icon size={20} strokeWidth={1.8} />
            {label}
          </Link>
        ))}
      </div>
    )
  }
  return (
    <div className="space-y-0.5">
      {ITEMS.map(({ href, label, icon: Icon, match }) => (
        <Link
          key={href}
          href={href}
          className={cx(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
            match(path) ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-ink',
          )}
        >
          <Icon size={17} strokeWidth={1.8} />
          {label}
        </Link>
      ))}
    </div>
  )
}

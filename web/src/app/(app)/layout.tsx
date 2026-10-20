import Link from 'next/link'
import { requireMe } from '@/lib/auth'
import { db } from '@/lib/supabase/server'
import { signOut } from '../login/actions'
import { NavLinks } from './NavLinks'
import { Badge } from '@/components/ui'
import { AskButton } from '@/components/chat/AskButton'
import { BookOpen } from 'lucide-react'

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const me = await requireMe()
  const { data: org } = await db().from('org_settings').select('test_mode, test_email, company_name').maybeSingle()

  return (
    <div className="min-h-dvh lg:pl-60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-solid text-sm font-bold text-white">H</span>
          <span className="font-semibold tracking-tight">HireEasy</span>
        </Link>
        <NavLinks variant="sidebar" isManager={me.appRole !== 'hm'} />
        <div className="mt-auto space-y-3 px-2">
          {org?.test_mode && (
            <Link href="/settings" className="block">
              <Badge tone="warn" className="w-full justify-center py-1 text-center">{org.test_email ? `Test mode — emails go to ${org.test_email}` : 'Test mode on — set a test email in Settings'}</Badge>
            </Link>
          )}
          <div className="text-[13px]">
            <p className="truncate font-medium text-ink">{me.fullName || me.email}</p>
            <p className="truncate text-faint">{me.email} · {me.appRole.toUpperCase()}</p>
          </div>
          <form action={signOut}>
            <button className="text-[13px] text-muted hover:text-ink">Sign out</button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-solid text-xs font-bold text-white">H</span>
          <span className="font-semibold tracking-tight">HireEasy</span>
        </Link>
        <div className="flex items-center gap-3">
          {org?.test_mode && <Badge tone="warn">Test mode</Badge>}
          <Link href="/guide" aria-label="How it works" className="text-muted hover:text-ink"><BookOpen size={19} strokeWidth={1.8} /></Link>
          <form action={signOut}>
            <button className="text-[13px] text-muted">Sign out</button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">{children}</main>

      <AskButton userKey={me.id} />

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <NavLinks variant="tabs" isManager={me.appRole !== 'hm'} />
      </nav>
    </div>
  )
}

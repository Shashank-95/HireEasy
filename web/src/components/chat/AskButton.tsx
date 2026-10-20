'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { ChatPanel } from './ChatPanel'

/** The floating "Ask" button, on every page except the full Ask page. */
export function AskButton({ userKey }: { userKey: string }) {
  const [open, setOpen] = useState(false)
  const path = usePathname()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    // Pages with their own action bar open the panel from a button in it
    const onAsk = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('hireeasy:ask', onAsk)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('hireeasy:ask', onAsk)
    }
  }, [])
  if (path.startsWith('/ask')) return null
  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask HireEasy about this page"
          title="Ask HireEasy about this page"
          className="fixed bottom-20 right-4 z-30 flex max-lg:hidden [body:has([data-savebar])_&]:hidden items-center gap-2 rounded-full bg-accent-solid p-3 sm:px-4 text-sm font-medium text-white shadow-lg hover:bg-accent-solid-hover lg:bottom-6 lg:right-6"
        >
          <MessageCircle size={17} /> <span className="hidden sm:inline">Ask</span>
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-40 lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[420px]">
          <div className="absolute inset-0 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />
          <div className="relative flex h-full flex-col border-l border-line bg-bg shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-line bg-surface px-4">
              <p className="font-semibold">Ask HireEasy</p>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-surface-2"><X size={18} /></button>
            </div>
            <div className="min-h-0 flex-1"><ChatPanel compact userKey={userKey} /></div>
          </div>
        </div>
      )}
    </>
  )
}

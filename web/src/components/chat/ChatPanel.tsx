'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import { cx } from '@/components/ui'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  options?: string[]
  sources?: { label: string; href: string }[]
  verified?: boolean
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** Which role/candidate the person is looking at, so "this candidate" works. */
export function contextFromPath(path: string) {
  const m = path.match(new RegExp(`^/roles/(${UUID})(?:/applicants/(${UUID}))?`))
  return { roleId: m?.[1], candidateId: m?.[2] }
}

const SUGGESTIONS = {
  global: ['What needs my attention right now?', 'How are my roles doing?', 'Who is ready for a final-round interview?'],
  role: ['Who are the top 5 candidates so far?', 'Why were most applicants stopped?', 'Who is waitlisted, and why?'],
  candidate: ['Why is this candidate where they are?', 'Summarise their interview', 'What were their weakest answers?'],
}

/** Safe mini-markdown: **bold** (may contain a link), [links](/internal), > quotes, bullet and numbered lines. Nothing else is interpreted. */
function Rich({ text: raw }: { text: string }) {
  // Inline code marks (`…`) are shown as plain text
  const text = raw.replace(/`([^`\n]*)`/g, '$1')
  const inline = (s: string, key: string): ReactNode[] => {
    const parts: ReactNode[] = []
    const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((\/(?![\/\\])[^)\s]*)\)/g
    let last = 0
    let m: RegExpExecArray | null
    let i = 0
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push(s.slice(last, m.index))
      if (m[1]) parts.push(<strong key={`${key}-b${i++}`}>{inline(m[1], `${key}-b${i}`)}</strong>)
      else parts.push(<Link key={`${key}-l${i++}`} href={m[3]} className="font-medium text-accent underline-offset-2 hover:underline">{m[2]}</Link>)
      last = m.index + m[0].length
    }
    if (last < s.length) parts.push(s.slice(last))
    return parts
  }
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: ReactNode[] } | null = null
  const flush = () => {
    if (!list) return
    blocks.push(list.ordered ? <ol key={blocks.length} className="ml-4 list-decimal space-y-1">{list.items}</ol> : <ul key={blocks.length} className="ml-4 list-disc space-y-1">{list.items}</ul>)
    list = null
  }
  text.split('\n').forEach((line, i) => {
    const b = line.match(/^\s*[-*•]\s+(.*)$/)
    const n = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (b || n) {
      const ordered = !!n
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push(<li key={i}>{inline((b ?? n)![1], `li${i}`)}</li>)
      return
    }
    flush()
    const q = line.match(/^\s*>\s?(.*)$/)
    if (q) blocks.push(<blockquote key={i} className="border-l-2 border-line pl-3 text-muted">{inline(q[1], `q${i}`)}</blockquote>)
    else if (line.trim()) blocks.push(<p key={i}>{inline(line, `p${i}`)}</p>)
  })
  flush()
  return <div className="space-y-2">{blocks}</div>
}

export function ChatPanel({ compact = false, userKey }: { compact?: boolean; userKey: string }) {
  const path = usePathname()
  const ctx = useMemo(() => contextFromPath(path), [path])
  const store = `hireeasy-chat:${userKey}`
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  // Keep the conversation across page changes in this tab
  // An empty conversation is never written, so the first (empty) render can't
  // overwrite a saved one; "New conversation" clears storage explicitly
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(store)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state (storage / async load) must be read after mount
      if (saved) setMessages(JSON.parse(saved))
    } catch {}
  }, [store])
  useEffect(() => {
    try {
      if (messages.length) sessionStorage.setItem(store, JSON.stringify(messages.slice(-30)))
    } catch {}
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, store])

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    const next: Msg[] = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The assistant only needs the recent conversation; long chats would exceed the request limit
        body: JSON.stringify({ messages: next.slice(-20).map(m => ({ role: m.role, content: m.content.slice(0, 8000) })), context: ctx }),
      })
      const data = await res.json()
      setMessages([...next, res.ok ? { role: 'assistant', content: data.answer, options: data.options, sources: data.sources, verified: data.verified } : { role: 'assistant', content: data.error ?? 'Something went wrong. Please try again.' }])
    } catch {
      setMessages([...next, { role: 'assistant', content: 'Could not reach the server. Check your connection and try again.' }])
    } finally {
      setBusy(false)
    }
  }

  const suggestions = ctx.candidateId ? SUGGESTIONS.candidate : ctx.roleId ? SUGGESTIONS.role : SUGGESTIONS.global

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className={cx('flex flex-col', compact ? 'pt-2' : 'pt-10 sm:items-center sm:text-center')}>
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent"><Sparkles size={18} /></span>
            <p className="text-[15px] font-semibold">Ask about any role or candidate</p>
            <p className="mt-1 max-w-md text-[13px] text-muted">
              Answers come only from HireEasy’s records — every decision, score, interview and reason — and link to where you can check them.
              {ctx.candidateId ? ' Questions here are about the candidate you have open.' : ctx.roleId ? ' Questions here are about the role you have open.' : ''}
            </p>
            <div className={cx('mt-4 flex flex-col gap-2', !compact && 'sm:items-center')}>
              {suggestions.map(s => (
                <button key={s} onClick={() => send(s)} className="rounded-lg border border-line bg-surface px-3 py-2 text-left text-[13px] hover:bg-surface-2">{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <Fragment key={i}>
                {m.role === 'user' ? (
                  <div className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-accent-solid px-3.5 py-2 text-[14px] text-white [overflow-wrap:anywhere]">{m.content}</div>
                ) : (
                  <div className="max-w-[95%] space-y-2">
                    <div className="rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5 text-[14px] leading-relaxed">
                      <Rich text={m.content} />
                    </div>
                    {m.options && m.options.length > 0 && i === messages.length - 1 && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.options.map(o => <button key={o} onClick={() => send(o)} className="rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-[12px] font-medium text-accent-text hover:brightness-95">{o}</button>)}
                      </div>
                    )}
                    {m.sources && m.sources.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-faint">
                        <ShieldCheck size={13} className={m.verified === false ? 'text-warn' : 'text-success'} />
                        <span>{m.verified === false ? 'Not verified —' : 'From'}</span>
                        {m.sources.map(s => <Link key={s.href} href={s.href} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-muted hover:text-ink">{s.label}</Link>)}
                      </div>
                    )}
                  </div>
                )}
              </Fragment>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-[13px] text-muted">
                <span className="flex gap-1"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:240ms]" /></span>
                Checking the records…
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <form
        onSubmit={e => {
          e.preventDefault()
          send(input)
        }}
        className="border-t border-line bg-surface px-3 py-3"
      >
        <div className="flex items-end gap-2">
          {messages.length > 0 && (
            <button type="button" onClick={() => { setMessages([]); try { sessionStorage.removeItem(store) } catch {} }} title="New conversation" aria-label="New conversation" className="mb-1.5 rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-ink"><RotateCcw size={16} /></button>
          )}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            rows={1}
            autoFocus
            placeholder={ctx.candidateId ? 'Ask about this candidate…' : ctx.roleId ? 'Ask about this role…' : 'e.g. Why was Priya rejected for APM?'}
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2.5 text-[14px] placeholder:text-faint focus:border-accent focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
            aria-label="Ask a question"
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-solid text-white disabled:opacity-40"><ArrowUp size={17} /></button>
        </div>
        <p className="mt-1.5 text-center text-[11px] text-faint">Read-only · only roles you can access · every figure is checked against the records</p>
      </form>
    </div>
  )
}

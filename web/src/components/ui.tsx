import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

/**
 * Shared building blocks. Server-safe (no hooks), so they render anywhere.
 * Every page uses these instead of one-off styles to keep the app consistent.
 */

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const BTN: Record<Variant, string> = {
  primary: 'bg-accent-solid text-white hover:bg-accent-solid-hover shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:brightness-95',
}
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
}

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md') =>
  cx(
    'inline-flex items-center justify-center rounded-lg font-medium transition-colors whitespace-nowrap',
    'disabled:opacity-50 disabled:pointer-events-none',
    BTN[variant],
    SIZE[size],
  )

export function Button({ variant = 'primary', size = 'md', className, ...p }: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return <button {...p} className={cx(buttonClass(variant, size), className)} />
}

export function ButtonLink({ variant = 'primary', size = 'md', className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...p} className={cx(buttonClass(variant, size), className)} />
}

export function Card({ className, ...p }: ComponentProps<'div'>) {
  return <div {...p} className={cx('rounded-xl border border-line bg-surface shadow-[var(--shadow)]', className)} />
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

type Tone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'info'
const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-success-soft text-success',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
}

export function Badge({ tone = 'neutral', className, ...p }: ComponentProps<'span'> & { tone?: Tone }) {
  return <span {...p} className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-medium', TONE[tone], className)} />
}

export function Notice({ tone = 'info', title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-lg px-4 py-3 text-[13px] leading-relaxed', TONE[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cx(title ? 'mt-0.5' : '', 'opacity-90')}>{children}</div>}
    </div>
  )
}

const FIELD_BASE = 'rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus:ring-4 focus:ring-[var(--ring)] focus:border-accent disabled:opacity-60'
/** Full width unless the caller sets a width (cx doesn't merge Tailwind classes, so w-full would win). */
const field = (className?: string) => cx(FIELD_BASE, /(^|\s)(\w+:)?w-/.test(className ?? '') ? '' : 'w-full')

export function Input({ className, ...p }: ComponentProps<'input'>) {
  return <input {...p} className={cx(field(className), 'h-10', className)} />
}

export function Textarea({ className, ...p }: ComponentProps<'textarea'>) {
  return <textarea {...p} className={cx(field(className), 'py-2 leading-relaxed', className)} />
}

export function Select({ className, ...p }: ComponentProps<'select'>) {
  return <select {...p} className={cx(field(className), 'h-10 pr-8', className)} />
}

/** Label + hint + control. The hint is where we tell people how to fill it in. */
export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[12px] text-danger">{error}</span> : hint ? <span className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  )
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className={cx('mt-1 text-2xl font-semibold tabular-nums', tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : tone === 'success' ? 'text-success' : 'text-ink')}>{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-faint">{hint}</p>}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Tabs as links, so every tab has a URL people can share. */
export function TabLinks({ tabs, active }: { tabs: { href: string; label: ReactNode; key: string; badge?: ReactNode }[]; active: string }) {
  return (
    <nav data-tabs className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-1">
        {tabs.map(t => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={t.key === active ? 'page' : undefined}
            className={cx(
              '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              t.key === active ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.badge}
          </Link>
        ))}
      </div>
    </nav>
  )
}

/** "How this works" panel at the top of a step. Short, scannable, skippable. */
export function HowItWorks({ steps, title = 'How this works' }: { steps: ReactNode[]; title?: string }) {
  return (
    <details className="group mb-6 rounded-xl border border-line bg-surface px-4 py-3 open:pb-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-medium text-ink">
        {title}
        <span className="text-faint transition-transform group-open:rotate-180">▾</span>
      </summary>
      <ol className="mt-3 space-y-1.5 text-[13px] text-muted">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-text">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}

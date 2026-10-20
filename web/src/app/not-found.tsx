import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-solid text-lg font-bold text-white">H</span>
      <h1 className="mt-4 text-lg font-semibold text-ink">This page doesn’t exist</h1>
      <p className="mt-1 max-w-sm text-sm text-muted">The link may be mistyped or out of date.</p>
      <Link href="/" className="mt-5 text-sm font-medium text-accent underline">Go to HireEasy</Link>
    </main>
  )
}

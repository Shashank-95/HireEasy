'use client'
import { startTransition, useEffect, useRef, type ComponentProps } from 'react'

/**
 * A form for a server action that keeps what the person typed when the action
 * returns an error. (A plain `<form action>` is reset by React after every
 * submission, wiping their input.) Pass `clearAfter` — e.g. the success
 * message — to clear the fields only once it succeeds.
 */
export function KeepForm({ action, clearAfter, ...props }: Omit<ComponentProps<'form'>, 'action' | 'onSubmit'> & { action: (form: FormData) => void; clearAfter?: unknown }) {
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (clearAfter) ref.current?.reset()
  }, [clearAfter])
  return (
    <form
      {...props}
      ref={ref}
      onSubmit={e => {
        e.preventDefault()
        const form = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter)
        startTransition(() => action(form))
      }}
    />
  )
}

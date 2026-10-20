import Link from 'next/link'
import { EmptyState } from '@/components/ui'

/** Shown for any role, candidate or page that doesn't exist — or that this person can't see. */
export default function NotFound() {
  return (
    <div className="py-10">
      <EmptyState
        title="This page isn’t available"
        description="It may have been removed, or it belongs to a role you haven’t been added to. Ask HR to add you to the role if you need it."
        action={<Link href="/" className="text-sm font-medium text-accent underline">Back to your roles</Link>}
      />
    </div>
  )
}

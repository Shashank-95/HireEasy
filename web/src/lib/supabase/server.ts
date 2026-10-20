import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** The signed-in user's client. Row-level security applies. */
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: list => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component — the proxy refreshes the session instead
        }
      },
    },
  })
}

let admin: SupabaseClient | null = null

/**
 * Service client: bypasses row-level security. Only for server code that has
 * already checked who is asking (see lib/auth.ts), the background runner, and
 * candidate-facing routes that authenticate by interview token.
 */
export function db(): SupabaseClient {
  if (!admin) {
    admin = createAdminClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return admin
}

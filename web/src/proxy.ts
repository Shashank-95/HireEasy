import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Keeps the Supabase session fresh and sends signed-out people to /login.
 * Candidate interview pages and machine endpoints authenticate their own way
 * (interview token, cron secret), so they are excluded by the matcher.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: list => {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const isPublic = path === '/login' || path.startsWith('/auth/')

  if (!data.user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = path === '/' ? '' : `?next=${encodeURIComponent(path + request.nextUrl.search)}`
    return NextResponse.redirect(url)
  }
  if (data.user && path === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|i/|api/interview|api/cron|api/google/callback|.*\\.(?:svg|png|jpg|ico|webp)$).*)'],
}

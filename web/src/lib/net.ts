import 'server-only'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

/**
 * Fetching a link someone else typed (a sheet, a resume) must never reach the
 * server's own network. Every hop of a redirect is checked: https only, and
 * the host must resolve to public addresses. Bodies are capped while
 * streaming, not after.
 */
export class UnsafeUrl extends Error {}
export class TooLarge extends Error {}

const MAX_REDIRECTS = 5

function privateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
    return mapped ? privateAddress(mapped) : false
  }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}

export async function assertPublicHttps(url: URL): Promise<void> {
  if (url.protocol !== 'https:') throw new UnsafeUrl('Only secure (https) links can be opened.')
  if (url.username || url.password) throw new UnsafeUrl('Links with a username or password are not allowed.')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (/^(localhost|metadata\.google\.internal)$/i.test(host) || host.endsWith('.internal') || host.endsWith('.local')) throw new UnsafeUrl('That link points to a private address.')
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map(a => a.address)
  if (!addrs.length) throw new UnsafeUrl('That link’s website could not be found.')
  if (addrs.some(privateAddress)) throw new UnsafeUrl('That link points to a private address.')
}

/** fetch() for untrusted links: checked redirects, timeout, and a streamed size cap. */
export async function safeFetch(link: string | URL, opts: { maxBytes: number; timeoutMs?: number }): Promise<{ res: Response; body: Uint8Array; finalUrl: URL }> {
  let url = new URL(link)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000)
  try {
    for (let hop = 0; ; hop++) {
      await assertPublicHttps(url)
      const res = await fetch(url, { redirect: 'manual', signal: ctrl.signal, cache: 'no-store' })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        if (hop >= MAX_REDIRECTS) throw new UnsafeUrl('That link redirects too many times.')
        url = new URL(res.headers.get('location')!, url)
        continue
      }
      const declared = Number(res.headers.get('content-length') ?? 0)
      if (declared > opts.maxBytes) throw new TooLarge()
      const chunks: Uint8Array[] = []
      let size = 0
      if (res.body) {
        const reader = res.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > opts.maxBytes) {
            await reader.cancel()
            throw new TooLarge()
          }
          chunks.push(value)
        }
      }
      const body = new Uint8Array(size)
      let off = 0
      for (const c of chunks) {
        body.set(c, off)
        off += c.byteLength
      }
      return { res, body, finalUrl: url }
    }
  } finally {
    clearTimeout(timer)
  }
}

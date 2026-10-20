import 'server-only'

const PAGE = 1000

/**
 * Supabase returns at most 1,000 rows per request. For lists that can be
 * longer (a 1,247-row sheet), fetch page by page. `page(from, to)` must apply
 * `.range(from, to)` to a query with a stable order.
 */
export async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

/**
 * `.in('candidate_id', ids)` puts every id in the URL; past a few hundred the
 * request is too long. Query in chunks and join the results — each chunk keeps
 * its own ordering, and a candidate's rows always land in one chunk.
 */
export async function inChunks<T>(ids: string[], page: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>, size = 150): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += size) {
    const { data, error } = await page(ids.slice(i, i + size))
    if (error) throw error
    out.push(...(data ?? []))
  }
  return out
}

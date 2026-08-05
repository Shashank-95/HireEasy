import { get, set, del, createStore } from 'idb-keyval'
import type { StateStorage } from 'zustand/middleware'

// Dedicated IDB store for HireEasy
const idbStore = createStore('hireeasy-db', 'state')

// Debounce writes per key — coalesces rapid updates (e.g. 1000 candidates being scored)
// This dramatically reduces IDB pressure during bulk operations.
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingValues = new Map<string, string>()

function debouncedSet(name: string, value: string, delay = 500): Promise<void> {
  pendingValues.set(name, value)
  const existing = writeTimers.get(name)
  if (existing) clearTimeout(existing)

  return new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      const finalValue = pendingValues.get(name)
      pendingValues.delete(name)
      writeTimers.delete(name)
      if (finalValue === undefined) return resolve()
      try {
        await set(name, finalValue, idbStore)
        resolve()
      } catch (err) {
        console.error('[idbStorage] setItem failed:', err)
        reject(err)
      }
    }, delay)
    writeTimers.set(name, timer)
  })
}

// Flush any pending writes immediately (call before closing the app)
export async function flushIdbStorage() {
  const promises: Promise<void>[] = []
  for (const [name, value] of pendingValues.entries()) {
    const timer = writeTimers.get(name)
    if (timer) clearTimeout(timer)
    promises.push(set(name, value, idbStore).catch((e) => console.error(e)))
  }
  pendingValues.clear()
  writeTimers.clear()
  await Promise.all(promises)
}

// Auto-flush on page hide/unload to avoid losing pending writes
if (typeof window !== 'undefined') {
  const handler = () => { void flushIdbStorage() }
  window.addEventListener('beforeunload', handler)
  window.addEventListener('pagehide', handler)
}

/**
 * Zustand-compatible storage adapter backed by IndexedDB.
 *
 * Why: localStorage has a hard 5MB quota per origin. IndexedDB allows
 * hundreds of MB to multiple GB depending on the browser, easily handling
 * 1000+ candidates with full response data, transcripts, and resumes.
 *
 * On first use, automatically migrates any existing localStorage data
 * for the same key into IndexedDB so we don't lose user data.
 */
export const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      // Try IndexedDB first
      const value = await get<string>(name, idbStore)
      if (value !== undefined) return value

      // One-time migration: if localStorage has the key, copy it to IDB and clear LS
      const lsValue = localStorage.getItem(name)
      if (lsValue !== null) {
        await set(name, lsValue, idbStore)
        try { localStorage.removeItem(name) } catch {}
        return lsValue
      }
      return null
    } catch (err) {
      console.error('[idbStorage] getItem failed:', err)
      // Fallback to localStorage
      return localStorage.getItem(name)
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    // Debounce per-key to coalesce rapid writes (e.g. screening 1000 candidates)
    return debouncedSet(name, value)
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      await del(name, idbStore)
    } catch (err) {
      console.error('[idbStorage] removeItem failed:', err)
    }
  },
}

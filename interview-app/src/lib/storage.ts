interface StorageData {
  questions: Record<string, {
    token: string
    jobTitle: string
    sampleQuestion: string
    questions: string[]
    createdAt: string
  }>
  results: Record<string, {
    token: string
    candidateName: string
    responses: { question: string; transcript: string }[]
    completedAt: string
  }>
}

// In-memory store that persists across requests within the same serverless instance.
// On Vercel, the instance stays warm for ~5–15 minutes — sufficient for the
// POST-questions → candidate-takes-interview → POST-results → GET-results flow
// since all operations typically happen within that window.
// For local dev (next dev), Node stays alive so data persists for the whole session.

let store: StorageData = { questions: {}, results: {} }

// Also try filesystem for local dev persistence across server restarts
let fsModule: typeof import('fs') | null = null
let pathModule: typeof import('path') | null = null
let dataFilePath: string | null = null

try {
  fsModule = require('fs')
  pathModule = require('path')
  dataFilePath = pathModule!.join(process.cwd(), '.interview-data.json')

  // Load from disk on first import
  if (fsModule!.existsSync(dataFilePath!)) {
    store = JSON.parse(fsModule!.readFileSync(dataFilePath!, 'utf-8'))
  }
} catch {
  // Filesystem not available (Vercel serverless) — in-memory only
}

function persistToDisk() {
  if (fsModule && dataFilePath) {
    try {
      fsModule.writeFileSync(dataFilePath, JSON.stringify(store, null, 2), 'utf-8')
    } catch {
      // Silent — filesystem may be read-only
    }
  }
}

export function readData(): StorageData {
  return store
}

export function writeData(data: StorageData): void {
  store = data
  persistToDisk()
}

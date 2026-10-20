import 'server-only'
import { createHash } from 'node:crypto'
import { safeFetch, TooLarge, UnsafeUrl } from '../net'

/**
 * Downloads a resume from the link in the application. Only public https
 * links are followed, never internal addresses, and files are capped at
 * 10 MB. Returns the text for PDF and DOCX.
 */
export class ResumeError extends Error {}

const MAX_BYTES = 10 * 1024 * 1024

/** Google Drive "view" links → direct download links. */
export function directLink(url: string): string {
  const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/)
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1]}`
  const docs = url.match(/docs\.google\.com\/document\/d\/([\w-]+)/)
  if (docs) return `https://docs.google.com/document/d/${docs[1]}/export?format=pdf`
  return url
}

export async function downloadResume(link: string): Promise<{ bytes: Uint8Array; kind: 'pdf' | 'docx'; sha256: string }> {
  let url: URL
  try {
    url = new URL(directLink(link.trim()))
  } catch {
    throw new ResumeError('The resume link is not a valid web address.')
  }
  let res: Response
  let buf: Uint8Array
  try {
    ;({ res, body: buf } = await safeFetch(url, { maxBytes: MAX_BYTES, timeoutMs: 20_000 }))
  } catch (e) {
    if (e instanceof TooLarge) throw new ResumeError('The resume file is larger than 10 MB.')
    if (e instanceof UnsafeUrl) throw new ResumeError(e.message.replace('That link', 'That resume link'))
    throw new ResumeError('The resume link did not respond.')
  }
  if (!res.ok) throw new ResumeError(`The resume link returned an error (${res.status}). It may have expired or need a login.`)

  // Trust the bytes, not the headers
  const head = String.fromCharCode(...buf.slice(0, 5))
  const kind = head.startsWith('%PDF') ? 'pdf' : head.startsWith('PK') ? 'docx' : null
  if (!kind) {
    const type = res.headers.get('content-type') ?? ''
    throw new ResumeError(type.includes('html') ? 'The resume link opens a web page (probably a login) instead of a file.' : 'The resume is not a PDF or Word document.')
  }
  return { bytes: buf, kind, sha256: createHash('sha256').update(buf).digest('hex') }
}

export async function extractResumeText(bytes: Uint8Array, kind: 'pdf' | 'docx'): Promise<string> {
  if (kind === 'docx') {
    const mammoth = await import('mammoth')
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) })
    return value
  }
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}

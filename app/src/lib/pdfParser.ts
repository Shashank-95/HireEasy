import * as pdfjsLib from 'pdfjs-dist'

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

// Extract text from an ArrayBuffer (for downloaded PDFs / resume URLs)
export async function extractTextFromPdfBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  return extractPdfFromArrayBuffer(arrayBuffer, 'downloaded resume')
}

// Extract text from a File object (for user-uploaded PDFs)
export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  return extractPdfFromArrayBuffer(arrayBuffer, file.name)
}

async function extractPdfFromArrayBuffer(arrayBuffer: ArrayBuffer, sourceName: string): Promise<string> {
  try {
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const pageTexts: string[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()

      // Reconstruct text with proper spacing and line breaks
      let lastY: number | null = null
      let lineText = ''
      const lines: string[] = []

      for (const item of content.items) {
        if (!('str' in item)) continue
        const textItem = item as { str: string; transform: number[] }
        const y = textItem.transform[5]

        if (lastY !== null && Math.abs(y - lastY) > 2) {
          if (lineText.trim()) lines.push(lineText.trim())
          lineText = textItem.str
        } else {
          lineText += textItem.str
        }
        lastY = y
      }
      if (lineText.trim()) lines.push(lineText.trim())

      pageTexts.push(lines.join('\n'))
    }

    const fullText = pageTexts.join('\n\n').trim()

    if (fullText.length < 50) {
      return `[PDF content from: ${sourceName}]\n\nThe PDF appears to contain mostly images or scanned content. For best results, ensure the JD is a text-based PDF.`
    }

    return fullText
  } catch (err) {
    console.error('PDF parsing error:', err)
    // Fallback: try raw text extraction from PDF bytes
    return fallbackExtractFromBuffer(arrayBuffer, sourceName)
  }
}

function fallbackExtractFromBuffer(arrayBuffer: ArrayBuffer, sourceName: string): string {
  const uint8Array = new Uint8Array(arrayBuffer)
  const decoder = new TextDecoder('latin1')
  const raw = decoder.decode(uint8Array)

  const textBlocks: string[] = []

  const btEtPattern = /BT\s([\s\S]*?)ET/g
  let match

  while ((match = btEtPattern.exec(raw)) !== null) {
    const block = match[1]

    const tjPattern = /\(([^)]*)\)\s*Tj/g
    let tj
    while ((tj = tjPattern.exec(block)) !== null) {
      textBlocks.push(decodePdfString(tj[1]))
    }

    const tjArrayPattern = /\[(.*?)\]\s*TJ/g
    let tjArr
    while ((tjArr = tjArrayPattern.exec(block)) !== null) {
      const innerPattern = /\(([^)]*)\)/g
      let inner
      const parts: string[] = []
      while ((inner = innerPattern.exec(tjArr[1])) !== null) {
        parts.push(decodePdfString(inner[1]))
      }
      textBlocks.push(parts.join(''))
    }
  }

  const text = textBlocks.join(' ').replace(/\s+/g, ' ').trim()

  if (text.length < 50) {
    return `[PDF content from: ${sourceName}]\n\nCould not extract text. The PDF may use an unsupported encoding.`
  }

  return text
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
}

export async function extractTextFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  try {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(arrayBuffer)
    const docXml = await zip.file('word/document.xml')?.async('text')
    if (!docXml) return ''

    return docXml
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return `[Document content from: ${file.name}]`
  }
}

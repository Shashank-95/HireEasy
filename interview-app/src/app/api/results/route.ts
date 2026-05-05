import { NextRequest, NextResponse } from 'next/server'
import { readData, writeData } from '../../../lib/storage'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, candidateName, responses } = body

    if (!token || !responses) {
      return NextResponse.json({ error: 'Missing token or responses' }, { status: 400 })
    }

    const data = readData()
    data.results[token] = {
      token,
      candidateName: candidateName || 'Unknown',
      responses,
      completedAt: new Date().toISOString(),
    }
    writeData(data)

    return NextResponse.json({ success: true, token })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  const data = readData()

  if (token) {
    const result = data.results[token]
    if (!result) {
      return NextResponse.json({ error: 'Result not found' }, { status: 404 })
    }
    return NextResponse.json(result)
  }

  return NextResponse.json(Object.values(data.results))
}

import { NextRequest, NextResponse } from 'next/server'
import { readData, writeData } from '../../../lib/storage'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, questions, jobTitle, sampleQuestion } = body

    if (!token || !questions || !Array.isArray(questions)) {
      return NextResponse.json({ error: 'Missing token or questions' }, { status: 400 })
    }

    const data = readData()
    data.questions[token] = {
      token,
      jobTitle: jobTitle || '',
      sampleQuestion: sampleQuestion || "This is a sample question to test your audio. Please tell us your name and the role you're interviewing for.",
      questions,
      createdAt: new Date().toISOString(),
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

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }

  const data = readData()
  const entry = data.questions[token]

  if (!entry) {
    return NextResponse.json({ error: 'Questions not found for token' }, { status: 404 })
  }

  return NextResponse.json(entry)
}

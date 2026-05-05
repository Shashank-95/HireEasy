import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const deepgramKey = process.env.DEEPGRAM_API_KEY
  if (!deepgramKey) {
    return NextResponse.json({ transcript: '[Transcription unavailable — no API key configured]' })
  }

  try {
    const audioBlob = await request.blob()

    const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramKey}`,
        'Content-Type': audioBlob.type || 'audio/webm',
      },
      body: audioBlob,
    })

    if (!response.ok) {
      return NextResponse.json({ transcript: '[Transcription failed]' }, { status: 502 })
    }

    const data = await response.json()
    const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '[No speech detected]'

    return NextResponse.json({ transcript })
  } catch {
    return NextResponse.json({ transcript: '[Transcription error]' }, { status: 500 })
  }
}

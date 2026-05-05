'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, MicOff, ChevronRight, CheckCircle2, AlertCircle, Volume2 } from 'lucide-react'

interface Props {
  token: string
  candidateName?: string
}

type Phase = 'mic-check' | 'sample' | 'interview' | 'complete'

interface RecordedAnswer {
  question: string
  audioBlob: Blob | null
  transcript: string
  isSample: boolean
}

const DEFAULT_sampleQuestion = "This is a sample question to test your audio. Please tell us your name and the role you're interviewing for."

const FALLBACK_QUESTIONS = [
  "Tell us about a challenging project you worked on and how you overcame obstacles.",
  "How do you prioritize tasks when working on multiple deadlines?",
  "Describe a situation where you had to learn something new quickly.",
  "What motivates you in your professional life?",
  "Where do you see yourself contributing most in this role?",
]

export default function InterviewRoom({ token, candidateName }: Props) {
  const [phase, setPhase] = useState<Phase>('mic-check')
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [micWorking, setMicWorking] = useState(false)
  const [recordings, setRecordings] = useState<RecordedAnswer[]>([])
  const [speaking, setSpeaking] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [loadedQuestions, setLoadedQuestions] = useState<string[] | null>(null)
  const [sampleQuestion, setSampleQuestion] = useState(DEFAULT_sampleQuestion)
  const [jobTitle, setJobTitle] = useState('')

  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioContext = useRef<AudioContext | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const animationFrame = useRef<number>(0)
  const recordingTimer = useRef<NodeJS.Timeout | null>(null)
  const selectedVoice = useRef<SpeechSynthesisVoice | null>(null)

  const questions = loadedQuestions || FALLBACK_QUESTIONS

  // Pick best available calm, mature FEMALE voice — consistent across all questions
  useEffect(() => {
    const pickVoice = () => {
      const voices = speechSynthesis.getVoices()
      if (voices.length === 0) return

      // Female voices only — prioritized for calm, professional tone
      const preferredFemale = [
        // macOS premium female voices
        'Samantha',        // macOS — warm, professional US female (the one you liked)
        'Karen',           // macOS — calm Australian female
        'Moira',           // macOS — warm Irish female
        'Tessa',           // macOS — clear South African female
        'Victoria',        // macOS — US female
        'Allison',         // macOS — US female
        // Windows female voices
        'Microsoft Zira',  // Windows — professional US female
        'Microsoft Hazel', // Windows — UK female
        'Microsoft Susan', // Windows — UK female
        // Chrome/Android female voices
        'Google UK English Female',
        'Google US English',
      ]

      // Try each preferred female voice
      for (const name of preferredFemale) {
        const match = voices.find(v =>
          v.name.includes(name) && v.lang.startsWith('en')
        )
        if (match) {
          selectedVoice.current = match
          console.log('[TTS] Selected voice:', match.name)
          return
        }
      }

      // Fallback: any female-sounding English voice (heuristic: avoid male-typical names)
      const maleNames = ['daniel', 'david', 'mark', 'james', 'alex', 'tom', 'fred', 'rishi', 'ralph', 'male']
      const englishVoices = voices.filter(v => v.lang.startsWith('en'))
      const femaleVoice = englishVoices.find(v =>
        !maleNames.some(m => v.name.toLowerCase().includes(m)) &&
        v.localService && !v.name.toLowerCase().includes('compact')
      )
      if (femaleVoice) {
        selectedVoice.current = femaleVoice
        console.log('[TTS] Fallback female voice:', femaleVoice.name)
        return
      }
      // Last resort: any English local voice
      const localVoice = englishVoices.find(v => v.localService)
      if (localVoice) {
        selectedVoice.current = localVoice
        console.log('[TTS] Last-resort voice:', localVoice.name)
      }
    }

    pickVoice()
    // Voices load async in some browsers — re-pick when ready
    speechSynthesis.onvoiceschanged = pickVoice

    return () => { speechSynthesis.onvoiceschanged = null }
  }, [])

  useEffect(() => {
    initMic()
    fetchQuestions()
    return () => {
      stream.current?.getTracks().forEach(t => t.stop())
      audioContext.current?.close()
      cancelAnimationFrame(animationFrame.current)
      if (recordingTimer.current) clearInterval(recordingTimer.current)
    }
  }, [])

  const fetchQuestions = async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/questions?token=${token}`)
      if (res.ok) {
        const data = await res.json()
        if (data.questions?.length > 0) {
          setLoadedQuestions(data.questions)
        }
        if (data.sampleQuestion) {
          setSampleQuestion(data.sampleQuestion)
        }
        if (data.jobTitle) {
          setJobTitle(data.jobTitle)
        }
      }
    } catch {
      // Use fallback questions
    }
  }

  const initMic = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioContext.current = new AudioContext()
      const source = audioContext.current.createMediaStreamSource(stream.current)
      analyser.current = audioContext.current.createAnalyser()
      analyser.current.fftSize = 256
      source.connect(analyser.current)
      monitorAudio()
    } catch {
      setMicWorking(false)
    }
  }

  const monitorAudio = () => {
    if (!analyser.current) return
    const data = new Uint8Array(analyser.current.frequencyBinCount)
    analyser.current.getByteFrequencyData(data)
    const avg = data.reduce((a, b) => a + b, 0) / data.length
    setAudioLevel(avg)
    if (avg > 10) setMicWorking(true)
    animationFrame.current = requestAnimationFrame(monitorAudio)
  }

  const speakQuestion = useCallback((text: string) => {
    // Cancel any ongoing speech
    speechSynthesis.cancel()
    setSpeaking(true)

    // Chrome bug workaround: after cancel(), the next speak() can ignore
    // the voice assignment. Adding a small delay + re-fetching the voice
    // from the voices list ensures the correct voice is always used.
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text)

      // Force the same female voice every time
      if (selectedVoice.current) {
        // Re-resolve from voice list to avoid stale reference after cancel()
        const voices = speechSynthesis.getVoices()
        const freshVoice = voices.find(v => v.name === selectedVoice.current!.name)
        utterance.voice = freshVoice || selectedVoice.current
      }

      // Calm, measured delivery
      utterance.rate = 0.88
      utterance.pitch = 1.0
      utterance.volume = 0.9

      utterance.onend = () => {
        setSpeaking(false)
        setCountdown(3)
      }
      utterance.onerror = () => {
        setSpeaking(false)
        setCountdown(3)
      }

      speechSynthesis.speak(utterance)
    }, 350)
  }, [])

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      setCountdown(null)
      startRecording()
      return
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const startRecording = () => {
    if (!stream.current) return
    chunks.current = []
    setRecordingTime(0)

    mediaRecorder.current = new MediaRecorder(stream.current, { mimeType: 'audio/webm' })
    mediaRecorder.current.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data)
    }
    mediaRecorder.current.start(250)
    setIsRecording(true)

    recordingTimer.current = setInterval(() => {
      setRecordingTime(t => t + 1)
    }, 1000)
  }

  const stopRecording = (): Promise<Blob> => {
    return new Promise((resolve) => {
      if (!mediaRecorder.current) return resolve(new Blob())

      mediaRecorder.current.onstop = () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        resolve(blob)
      }
      mediaRecorder.current.stop()
      setIsRecording(false)
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current)
        recordingTimer.current = null
      }
    })
  }

  const transcribeAudio = async (blob: Blob): Promise<string> => {
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: blob,
      })
      const data = await response.json()
      if (data.transcript && !data.transcript.startsWith('[')) {
        return data.transcript
      }
    } catch {
      // Fallback to client-side with URL param key
    }

    try {
      const deepgramKey = new URLSearchParams(window.location.search).get('dgkey')
      if (deepgramKey) {
        const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${deepgramKey}`,
            'Content-Type': 'audio/webm',
          },
          body: blob,
        })
        const data = await response.json()
        return data.results?.channels?.[0]?.alternatives?.[0]?.transcript || '[No speech detected]'
      }
    } catch {
      // Silent
    }

    return '[Audio recorded — transcription requires Deepgram API key]'
  }

  const handleFinishAnswer = async () => {
    const blob = await stopRecording()
    const isSample = phase === 'sample'
    const questionText = isSample ? sampleQuestion : questions[currentQuestion]

    let transcript = ''
    if (!isSample) {
      transcript = await transcribeAudio(blob)
    }

    setRecordings(prev => [...prev, {
      question: questionText,
      audioBlob: blob,
      transcript,
      isSample,
    }])

    if (isSample) {
      setPhase('interview')
      setCurrentQuestion(0)
      setTimeout(() => speakQuestion(questions[0]), 500)
    } else if (currentQuestion < questions.length - 1) {
      const next = currentQuestion + 1
      setCurrentQuestion(next)
      setTimeout(() => speakQuestion(questions[next]), 500)
    } else {
      setSubmitting(true)
      try {
        // Include current answer + all previous non-sample recordings
        const allNonSample = [
          ...recordings.filter(r => !r.isSample),
          { question: questionText, transcript, isSample: false },
        ].map(r => ({ question: r.question, transcript: r.transcript }))

        await fetch('/api/results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, candidateName, responses: allNonSample }),
        })
      } catch {
        console.error('Failed to submit results')
      }
      setSubmitting(false)
      setPhase('complete')
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const renderMicCheck = () => (
    <div className="text-center space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Microphone Check</h2>
        <p className="text-sm text-white/50">Speak to verify your microphone is working</p>
      </div>

      <div className="w-36 h-36 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto relative">
        <div
          className="absolute inset-0 rounded-full bg-brand-500/10 transition-transform duration-100"
          style={{ transform: `scale(${1 + audioLevel / 200})`, opacity: audioLevel / 100 }}
        />
        <Mic size={44} className={micWorking ? 'text-emerald-400' : 'text-white/30'} />
      </div>

      <div className="flex items-end justify-center gap-1 h-8">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="w-1.5 rounded-full bg-brand-500/60 transition-all duration-75"
            style={{ height: `${Math.max(3, (audioLevel / 4) * Math.random())}px` }}
          />
        ))}
      </div>

      {micWorking ? (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm">
            <CheckCircle2 size={16} />
            Audio detected — microphone working
          </div>
          <button
            onClick={() => { setPhase('sample'); setTimeout(() => speakQuestion(sampleQuestion), 500) }}
            className="px-8 py-3.5 bg-brand-600 hover:bg-brand-500 text-white font-medium rounded-xl transition-all hover:shadow-lg hover:shadow-brand-500/25"
          >
            Start Sample Question
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-white/30 text-sm">
          <AlertCircle size={16} />
          Speak to test your microphone...
        </div>
      )}
    </div>
  )

  const renderQuestion = () => {
    const isSample = phase === 'sample'
    const questionText = isSample ? sampleQuestion : questions[currentQuestion]

    return (
      <div className="text-center space-y-8">
        <div>
          {isSample ? (
            <span className="text-xs px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 font-medium mb-4 inline-block">
              SAMPLE — Not Scored
            </span>
          ) : (
            <span className="text-xs text-white/30 mb-2 block">
              Question {currentQuestion + 1} of {questions.length}
            </span>
          )}
          <h2 className="text-xl font-semibold text-white leading-relaxed max-w-lg mx-auto mt-2">
            {questionText}
          </h2>
        </div>

        {speaking && (
          <div className="flex items-center justify-center gap-3 text-brand-400 py-4">
            <Volume2 size={22} className="animate-pulse" />
            <span className="text-sm font-medium">Playing question...</span>
          </div>
        )}

        {countdown !== null && (
          <div className="py-4">
            <div className="text-5xl font-bold text-brand-400 mb-2">{countdown}</div>
            <p className="text-xs text-white/30">Recording starts in...</p>
          </div>
        )}

        {isRecording && (
          <div className="space-y-6 py-4">
            <div className="w-28 h-28 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mx-auto relative">
              <div className="absolute inset-0 rounded-full bg-red-500/10 pulse-ring" />
              <div className="text-center">
                <Mic size={28} className="text-red-400 mx-auto" />
                <span className="text-xs text-red-400/70 font-mono mt-1 block">{formatTime(recordingTime)}</span>
              </div>
            </div>

            <div className="flex items-end justify-center gap-0.5 h-8">
              {Array.from({ length: 40 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-red-400/60 audio-wave"
                  style={{ animationDelay: `${i * 0.04}s` }}
                />
              ))}
            </div>

            <button
              onClick={handleFinishAnswer}
              className="px-8 py-3.5 bg-white/[0.06] hover:bg-white/[0.1] text-white font-medium rounded-xl border border-white/[0.08] transition-all flex items-center gap-2 mx-auto"
            >
              {isSample ? 'Finish Sample & Begin Interview' : currentQuestion < questions.length - 1 ? 'Next Question' : 'Submit Interview'}
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {!speaking && countdown === null && !isRecording && (
          <p className="text-xs text-white/30 py-4">Recording begins automatically after the question is read aloud</p>
        )}

        {!isSample && (
          <div className="w-full max-w-xs mx-auto">
            <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all duration-500"
                style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
              />
            </div>
            <p className="text-xs text-white/20 mt-2">{currentQuestion + 1} / {questions.length}</p>
          </div>
        )}
      </div>
    )
  }

  const renderComplete = () => (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
        <CheckCircle2 size={36} className="text-emerald-400" />
      </div>
      <h2 className="text-2xl font-bold text-white">Interview Complete!</h2>
      <p className="text-sm text-white/50 max-w-md mx-auto">
        Thank you{candidateName ? `, ${candidateName}` : ''}. Your responses have been recorded and will be reviewed by the hiring team. You'll hear back within 5-7 business days.
      </p>
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 max-w-sm mx-auto">
        <p className="text-xs text-white/40">
          {recordings.filter(r => !r.isSample).length} questions answered · Interview ID: {token || 'demo'}
        </p>
      </div>
      <p className="text-xs text-white/20">You may close this window now.</p>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <Mic size={12} className="text-white" />
            </div>
            <span className="text-sm font-semibold text-white/60">HireEasy Interview</span>
          </div>
          {jobTitle && phase !== 'complete' && (
            <p className="text-xs text-brand-400/60 mb-1">{jobTitle}</p>
          )}
          {candidateName && phase !== 'complete' && (
            <p className="text-xs text-white/30">Welcome, {candidateName}</p>
          )}
        </div>

        {phase === 'mic-check' && renderMicCheck()}
        {(phase === 'sample' || phase === 'interview') && renderQuestion()}
        {phase === 'complete' && renderComplete()}
      </div>
    </div>
  )
}

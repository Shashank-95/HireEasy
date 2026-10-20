'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square, Volume2, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react'
import { Button, cx } from '@/components/ui'

interface Question {
  id: string
  text: string
  timeLimitSec: number
}
interface State {
  state: 'invited' | 'started' | 'submitted' | 'expired' | 'cancelled'
  preview: boolean
  roleTitle: string
  roundName: string
  firstName: string
  expiresAt: string
  questions: Question[]
  answered: { questionId: string; followupIndex: number }[]
  pendingFollowUp: { questionId: string; index: number; prompt: string } | null
}
interface Turn {
  questionId: string
  followupIndex: number
  prompt: string
  timeLimitSec: number
}

type Phase = 'loading' | 'error' | 'intro' | 'mic' | 'ready' | 'speaking' | 'recording' | 'silent' | 'uploading' | 'submitting' | 'done'

const IN_APP = /FBAN|FBAV|Instagram|LinkedInApp|Line\/|GSA\/|; wv\)/i
const SILENCE_RMS = 0.012

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus']) if (MediaRecorder.isTypeSupported(t)) return t
  return ''
}

/** Speaks sentence by sentence — Chrome cuts off long utterances. */
function speak(text: string, onEnd: () => void) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  if (!synth) return onEnd()
  synth.cancel()
  const voices = synth.getVoices()
  const voice =
    voices.find(v => /en-IN/i.test(v.lang) && /female|google|samantha|veena/i.test(v.name)) ??
    voices.find(v => /^en-(GB|US|IN)/i.test(v.lang) && /google|samantha|natural/i.test(v.name)) ??
    voices.find(v => /^en/i.test(v.lang))
  const parts = text.match(/[^.!?]+[.!?]*/g)?.map(p => p.trim()).filter(Boolean) ?? [text]
  let i = 0
  const next = () => {
    if (i >= parts.length) return onEnd()
    const u = new SpeechSynthesisUtterance(parts[i++])
    if (voice) u.voice = voice
    u.rate = 0.95
    u.onend = next
    u.onerror = next
    synth.speak(u)
  }
  next()
}

export function InterviewRoom({ token }: { token: string }) {
  const api = `/api/interview/${token}`
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState('')
  const [info, setInfo] = useState<State | null>(null)
  const [turn, setTurn] = useState<Turn | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [micOk, setMicOk] = useState(false)
  const [notice, setNotice] = useState('')
  const [previewScore, setPreviewScore] = useState<number | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const peakRef = useRef(0)
  const startRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafRef = useRef<number | null>(null)
  const doneRef = useRef<{ questionId: string; followupIndex: number }[]>([])

  const load = useCallback(async () => {
    let r: Response
    let data: { error?: string } & Record<string, unknown>
    try {
      r = await fetch(api, { cache: 'no-store' })
      data = await r.json().catch(() => ({ error: 'The interview service is having trouble right now. Please try again in a few minutes.' }))
    } catch {
      setError('We couldn’t connect. Check your internet connection and reload this page.')
      setPhase('error')
      return null
    }
    if (!r.ok) {
      setError(data.error ?? 'This link is not working.')
      setPhase('error')
      return null
    }
    const state = data as unknown as State
    setInfo(state)
    doneRef.current = state.answered
    if (state.state === 'submitted') setPhase('done')
    return state
  }, [api])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only state (storage / async load) must be read after mount
    load().then(d => d && d.state !== 'submitted' && setPhase('intro'))
    // Voices load asynchronously in Chrome
    window.speechSynthesis?.getVoices()
    const onVis = () => {
      if (document.visibilityState === 'hidden') fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'event', event: 'tab_hidden' }), keepalive: true })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      streamRef.current?.getTracks().forEach(t => t.stop())
      window.speechSynthesis?.cancel()
    }
  }, [api, load])

  /** The next thing to answer: a pending follow-up, else the first unanswered question. */
  const nextTurn = useCallback((s: State, pending: State['pendingFollowUp']): Turn | null => {
    if (pending) {
      const q = s.questions.find(x => x.id === pending.questionId)!
      return { questionId: pending.questionId, followupIndex: pending.index, prompt: pending.prompt, timeLimitSec: Math.min(q.timeLimitSec, 120) }
    }
    const q = s.questions.find(x => !doneRef.current.some(a => a.questionId === x.id && a.followupIndex === 0))
    return q ? { questionId: q.id, followupIndex: 0, prompt: q.text, timeLimitSec: q.timeLimitSec } : null
  }, [])

  const meter = (analyser: AnalyserNode) => {
    const buf = new Float32Array(analyser.fftSize)
    const loop = () => {
      analyser.getFloatTimeDomainData(buf)
      const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length)
      peakRef.current = Math.max(peakRef.current, rms)
      setLevel(Math.min(1, rms * 12))
      if (rms > SILENCE_RMS) setMicOk(true)
      rafRef.current = requestAnimationFrame(loop)
    }
    loop()
  }

  const enableMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      streamRef.current = stream
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      meter(analyser)
      setPhase('mic')
    } catch {
      setNotice('Microphone access was blocked. Allow the microphone for this site (the icon in the address bar), then try again.')
    }
  }

  const begin = async () => {
    if (!info) return
    await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) })
    const t = nextTurn(info, info.pendingFollowUp)
    if (!t) return submit()
    ask(t)
  }

  const ask = (t: Turn) => {
    setTurn(t)
    setNotice('')
    setPhase('speaking')
    speak(t.followupIndex ? t.prompt : t.prompt, () => setPhase('ready'))
  }

  const startRecording = () => {
    if (!streamRef.current || !turn) return
    const mime = pickMime()
    const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined)
    chunksRef.current = []
    peakRef.current = 0
    rec.ondataavailable = e => e.data.size && chunksRef.current.push(e.data)
    rec.onstop = () => finishRecording(rec.mimeType || mime)
    rec.start(1000)
    recRef.current = rec
    // eslint-disable-next-line react-hooks/purity -- runs in a recording event handler, not during render
    startRef.current = Date.now()
    setElapsed(0)
    setPhase('recording')
    timerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - startRef.current) / 1000)
      setElapsed(s)
      if (s >= turn.timeLimitSec) stopRecording()
    }, 250)
  }

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (recRef.current?.state === 'recording') recRef.current.stop()
  }

  const finishRecording = async (mime: string) => {
    if (!turn || !info) return
    // eslint-disable-next-line react-hooks/purity -- runs in a recording event handler, not during render
    const durationMs = Date.now() - startRef.current
    // Catch a silent recording before it's saved, so they can try again
    if (peakRef.current < SILENCE_RMS * 1.5) {
      setPhase('silent')
      return
    }
    setPhase('uploading')
    const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' })
    const form = new FormData()
    form.append('questionId', turn.questionId)
    form.append('followupIndex', String(turn.followupIndex))
    form.append('durationMs', String(durationMs))
    form.append('audio', blob, 'answer')
    let data: { error?: string; followUp?: State['pendingFollowUp']; heard?: boolean } = {}
    let saved = false
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(api, { method: 'POST', body: form })
        data = await r.json().catch(() => ({}))
        if (r.ok || r.status === 409) {
          saved = true
          break
        }
        if (r.status === 410) {
          setError(data.error ?? 'This interview has closed.')
          return setPhase('error')
        }
        if (r.status !== 502) break
      } catch {
        await new Promise(res => setTimeout(res, 1500))
      }
    }
    if (!saved) {
      // Never move on as if it was saved: ask them to record it again
      setNotice(data.error ?? 'We couldn’t save that answer — your connection may have dropped. Please record it again.')
      return setPhase('silent')
    }
    doneRef.current = [...doneRef.current, { questionId: turn.questionId, followupIndex: turn.followupIndex }]
    const t = nextTurn(info, data.followUp ?? null)
    if (!t) return submit()
    ask(t)
  }

  const submit = async () => {
    setPhase('submitting')
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit' }) })
        const d = await r.json().catch(() => ({}))
        if (r.ok) {
          if (typeof d.previewScore === 'number') setPreviewScore(d.previewScore)
          return setPhase('done')
        }
        if (r.status === 410 || r.status === 404) {
          setError(d.error ?? 'This interview has closed.')
          return setPhase('error')
        }
      } catch {
        // network blip: try again
      }
      await new Promise(res => setTimeout(res, 2000))
    }
    setError('All your answers are saved, but we couldn’t confirm the finish. Please reload this page — it will finish from where you are.')
    setPhase('error')
  }

  const qIndex = info && turn ? info.questions.findIndex(q => q.id === turn.questionId) : -1
  const total = info?.questions.length ?? 0
  const inApp = typeof navigator !== 'undefined' && IN_APP.test(navigator.userAgent)
  const noRecorder = typeof window !== 'undefined' && (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices)

  return (
    <main className="flex min-h-dvh flex-col bg-bg px-4 py-6 sm:py-12">
      <div className="mx-auto w-full max-w-xl flex-1">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-solid text-sm font-bold text-white">H</span>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold">{info?.roleTitle ?? 'Interview'}</p>
              <p className="text-[12px] text-muted">{info?.roundName}</p>
            </div>
          </div>
          {info?.preview && <span className="shrink-0 whitespace-nowrap rounded-md bg-warn-soft px-2 py-1 text-[12px] font-medium text-warn">Preview — not scored</span>}
        </header>

        {total > 0 && qIndex >= 0 && ['speaking', 'ready', 'recording', 'uploading', 'silent'].includes(phase) && (
          <div className="mb-4 flex gap-1.5" aria-label={`Question ${qIndex + 1} of ${total}`}>
            {info!.questions.map((q, i) => (
              <span key={q.id} className={cx('h-1.5 flex-1 rounded-full', i < qIndex ? 'bg-accent' : i === qIndex ? 'bg-accent/60' : 'bg-line')} />
            ))}
          </div>
        )}

        <section className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow)] sm:p-8">
          {phase === 'loading' && <p className="text-sm text-muted">Loading your interview…</p>}

          {phase === 'error' && (
            <div className="text-center">
              <AlertTriangle className="mx-auto text-warn" />
              <p className="mt-3 font-medium">{error}</p>
              <p className="mt-1 text-sm text-muted">If you think this is a mistake, reply to the email that sent you this link.</p>
            </div>
          )}

          {phase === 'intro' && info && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold">Hi {info.firstName} 👋</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  This is a short recorded interview with {total} question{total === 1 ? '' : 's'}. Each question is read aloud and shown on screen; you answer by speaking.
                  There may be a short follow-up. Take your time to think — the timer starts only when you press Start answering.
                </p>
              </div>
              <ul className="space-y-2 text-sm">
                {['Find a quiet place and use Chrome or Safari.', 'Speak naturally — accents and small slips don\'t matter, your thinking does.', 'You can leave and come back before the deadline; finished answers are saved.'].map(t => (
                  <li key={t} className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />{t}</li>
                ))}
              </ul>
              {inApp && <p className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">You seem to be inside another app’s browser, which often blocks the microphone. Open this link in Chrome or Safari instead.</p>}
              {noRecorder && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">This browser can’t record audio. Please open the link in a recent Chrome or Safari.</p>}
              <p className="text-[12px] text-faint">
                Your answers are recorded and transcribed so the hiring team can review them for this role only. Closes {new Date(info.expiresAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}.
              </p>
              {notice && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{notice}</p>}
              <Button className="w-full" onClick={enableMic} disabled={noRecorder}>I agree — set up my microphone</Button>
            </div>
          )}

          {phase === 'mic' && (
            <div className="space-y-5 text-center">
              <Mic className="mx-auto text-accent" />
              <div>
                <p className="font-medium">Say something to test your microphone</p>
                <p className="mt-1 text-sm text-muted">For example, “Hello, I’m ready.”</p>
              </div>
              <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-line"><div className="h-full bg-success transition-[width]" style={{ width: `${Math.round(level * 100)}%` }} /></div>
              <p className={cx('text-sm', micOk ? 'text-success' : 'text-faint')}>{micOk ? 'We can hear you.' : 'Waiting for sound…'}</p>
              <Button className="w-full" onClick={begin} disabled={!micOk}>Start the interview</Button>
            </div>
          )}

          {turn && ['speaking', 'ready', 'recording', 'uploading', 'silent'].includes(phase) && (
            <div className="space-y-6">
              <div>
                <p className="text-[12px] font-medium uppercase tracking-wide text-accent">{turn.followupIndex ? 'Follow-up' : `Question ${qIndex + 1} of ${total}`}</p>
                <p className="mt-2 text-lg font-medium leading-relaxed">{turn.prompt}</p>
              </div>

              {phase === 'speaking' && (
                <p className="flex items-center gap-2 text-sm text-muted"><Volume2 size={16} className="animate-pulse" /> Reading the question…</p>
              )}

              {phase === 'ready' && (
                <div className="space-y-3">
                  <Button size="lg" className="w-full" onClick={startRecording}><Mic size={18} /> Start answering</Button>
                  <div className="flex items-center justify-between text-[13px] text-muted">
                    <button className="flex items-center gap-1 hover:text-ink" onClick={() => ask(turn)}><RotateCcw size={14} /> Hear it again</button>
                    <span>Up to {Math.round(turn.timeLimitSec / 60 * 10) / 10} min</span>
                  </div>
                </div>
              )}

              {phase === 'recording' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" /><span className="relative inline-flex h-3 w-3 rounded-full bg-danger" /></span>
                    <span className="text-sm font-medium">Recording</span>
                    <span className="ml-auto font-mono text-sm tabular-nums">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} / {Math.floor(turn.timeLimitSec / 60)}:{String(turn.timeLimitSec % 60).padStart(2, '0')}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent transition-[width]" style={{ width: `${Math.min(100, (elapsed / turn.timeLimitSec) * 100)}%` }} /></div>
                  <div className="h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-success" style={{ width: `${Math.round(level * 100)}%` }} /></div>
                  <Button size="lg" className="w-full" onClick={stopRecording}><Square size={16} /> I’m done with this answer</Button>
                  {elapsed >= turn.timeLimitSec - 15 && <p className="text-center text-[13px] text-warn">About to reach the time limit.</p>}
                </div>
              )}

              {phase === 'uploading' && <p className="text-sm text-muted">Saving your answer…</p>}

              {phase === 'silent' && (
                <div className="space-y-3">
                  <p className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">{notice || 'We couldn\'t hear anything in that recording. Check your microphone isn\'t muted and try again.'}</p>
                  <Button className="w-full" onClick={startRecording}><Mic size={16} /> Record again</Button>
                </div>
              )}
            </div>
          )}

          {phase === 'submitting' && <p className="text-sm text-muted">Finishing up…</p>}

          {phase === 'done' && (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="mx-auto text-success" size={32} />
              <h1 className="text-lg font-semibold">All done — thank you!</h1>
              <p className="text-sm text-muted">Your answers are saved. The hiring team will be in touch by email about next steps.</p>
              {info?.preview && (
                <p className="rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-accent-text">
                  Preview result: {previewScore === null ? 'scoring needs an AI key — see Settings.' : `${previewScore}/100. The full breakdown — transcript, recordings and per-question scores — is under the role's Interviews tab → Your preview runs.`}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
      <p className="mt-8 text-center text-[11px] text-faint">Powered by HireEasy</p>
    </main>
  )
}

import { useSettingsStore } from '../stores/settingsStore'

interface TimeSlot {
  start: Date
  end: Date
  candidateName: string
}

interface CalendarEvent {
  start: string
  end: string
  summary: string
}

interface ConflictResult {
  hasConflicts: boolean
  conflicts: { slot: TimeSlot; conflictsWith: CalendarEvent }[]
  availableSlots: TimeSlot[]
}

export function generateTimeSlots(
  startDate: string,
  startTime: string,
  candidateCount: number,
  meetingLengthMinutes: number,
  breakMinutes: number = 15,
): TimeSlot[] {
  const slots: TimeSlot[] = []
  const slotStart = new Date(`${startDate}T${startTime}:00`)

  for (let i = 0; i < candidateCount; i++) {
    const start = new Date(slotStart.getTime() + i * (meetingLengthMinutes + breakMinutes) * 60000)
    const end = new Date(start.getTime() + meetingLengthMinutes * 60000)
    slots.push({ start, end, candidateName: '' })
  }

  return slots
}

export function detectConflicts(
  proposedSlots: TimeSlot[],
  existingEvents: CalendarEvent[],
): ConflictResult {
  const conflicts: { slot: TimeSlot; conflictsWith: CalendarEvent }[] = []
  const availableSlots: TimeSlot[] = []

  for (const slot of proposedSlots) {
    const conflicting = existingEvents.find(event => {
      const eventStart = new Date(event.start)
      const eventEnd = new Date(event.end)
      return slot.start < eventEnd && slot.end > eventStart
    })

    if (conflicting) {
      conflicts.push({ slot, conflictsWith: conflicting })
    } else {
      availableSlots.push(slot)
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
    availableSlots,
  }
}

export async function fetchCalendarEvents(date: string): Promise<CalendarEvent[]> {
  const settings = useSettingsStore.getState()
  if (!settings.googleTokens || !settings.googleClientId) return []

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI
  const dayStart = new Date(`${date}T00:00:00`).toISOString()
  const dayEnd = new Date(`${date}T23:59:59`).toISOString()

  if (isElectron) {
    try {
      const result = await (window as any).electronAPI.listCalendarEvents({
        clientId: settings.googleClientId,
        clientSecret: settings.googleClientSecret,
        tokens: JSON.parse(settings.googleTokens),
        timeMin: dayStart,
        timeMax: dayEnd,
      })
      return result.events || []
    } catch {
      return []
    }
  }

  // Browser fallback using Calendar API directly
  try {
    const tokens = JSON.parse(settings.googleTokens)
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(dayStart)}&timeMax=${encodeURIComponent(dayEnd)}&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    )
    if (!response.ok) return []
    const data = await response.json()
    return (data.items || []).map((item: any) => ({
      start: item.start.dateTime || item.start.date,
      end: item.end.dateTime || item.end.date,
      summary: item.summary || 'Busy',
    }))
  } catch {
    return []
  }
}

export function formatConflictMessage(conflicts: ConflictResult['conflicts']): string {
  if (conflicts.length === 0) return ''
  const lines = conflicts.map(c => {
    const time = c.slot.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return `${time} — conflicts with "${c.conflictsWith.summary}"`
  })
  return lines.join('\n')
}

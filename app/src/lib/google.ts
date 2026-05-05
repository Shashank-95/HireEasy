import { useSettingsStore } from '../stores/settingsStore'

declare global {
  interface Window {
    electronAPI?: {
      openExternal: (url: string) => Promise<void>
      platform: string
      googleAuth: (params: { clientId: string; clientSecret: string }) => Promise<{ tokens: any; email: string }>
      parseGoogleSheet: (params: { clientId: string; clientSecret: string; tokens: any; sheetUrl: string }) => Promise<{ rows: string[][]; sheetTitle: string }>
      sendEmail: (params: { clientId: string; clientSecret: string; tokens: any; to: string; subject: string; body: string }) => Promise<{ success: boolean }>
      createCalendarEvent: (params: { clientId: string; clientSecret: string; tokens: any; event: any }) => Promise<{ eventId: string; meetLink: string | null; htmlLink: string }>
      readFile: (filePath: string) => Promise<string>
      downloadFile: (url: string) => Promise<string>
    }
  }
}

function isElectron(): boolean {
  return !!window.electronAPI
}

function getGoogleCreds() {
  const s = useSettingsStore.getState()
  return {
    clientId: s.googleClientId,
    clientSecret: s.googleClientSecret,
    tokens: s.googleTokens ? JSON.parse(s.googleTokens) : null,
  }
}

export async function authenticateGoogle(): Promise<{ email: string }> {
  const { clientId, clientSecret } = getGoogleCreds()
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured. Go to Settings → Google Integration.')
  }

  if (isElectron()) {
    const result = await window.electronAPI!.googleAuth({ clientId, clientSecret })
    useSettingsStore.getState().setKey('googleTokens', JSON.stringify(result.tokens))
    useSettingsStore.getState().setKey('authenticatedEmail', result.email)
    return { email: result.email }
  }

  // Browser fallback: use Google OAuth popup flow
  return browserOAuthFlow(clientId, clientSecret)
}

async function browserOAuthFlow(clientId: string, clientSecret: string): Promise<{ email: string }> {
  const scopes = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' ')

  // Use authorization code flow with a popup — listen for the redirect
  const redirectUri = window.location.origin + '/oauth-callback'
  const state = Math.random().toString(36).substring(2, 15)

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${state}`

  // Open popup and wait for the auth code via postMessage
  const authCode = await new Promise<string>((resolve, reject) => {
    const popup = window.open(authUrl, 'google-auth', 'width=500,height=650,left=200,top=100')
    if (!popup) {
      reject(new Error('Popup blocked. Please allow popups for this site.'))
      return
    }

    // Poll the popup for the redirect URL (same-origin)
    const pollTimer = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(pollTimer)
          reject(new Error('Authentication cancelled.'))
          return
        }
        // Once popup navigates back to our origin, we can read the URL
        if (popup.location.origin === window.location.origin) {
          const params = new URLSearchParams(popup.location.search)
          const code = params.get('code')
          const returnedState = params.get('state')
          const error = params.get('error')
          clearInterval(pollTimer)
          popup.close()

          if (error) {
            reject(new Error(`Google auth error: ${error}`))
          } else if (code && returnedState === state) {
            resolve(code)
          } else {
            reject(new Error('Invalid auth response.'))
          }
        }
      } catch {
        // Cross-origin — popup is still on Google's domain, keep polling
      }
    }, 300)

    // Timeout after 3 minutes
    setTimeout(() => {
      clearInterval(pollTimer)
      if (popup && !popup.closed) popup.close()
      reject(new Error('Authentication timed out. Please try again.'))
    }, 180000)
  })

  // Exchange auth code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: authCode,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.json()
    throw new Error(err.error_description || 'Failed to exchange auth code for tokens')
  }

  const tokens = await tokenRes.json()

  // Fetch user email
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const userInfo = await userRes.json()
  const email = userInfo.email

  // Save tokens and email
  useSettingsStore.getState().setKey('googleTokens', JSON.stringify(tokens))
  useSettingsStore.getState().setKey('authenticatedEmail', email)

  return { email }
}

export async function parseGoogleSheet(sheetUrl: string): Promise<{ rows: string[][]; sheetTitle: string }> {
  const { clientId, clientSecret, tokens } = getGoogleCreds()
  if (!tokens) throw new Error('Not authenticated with Google. Please authenticate first.')

  if (isElectron()) {
    return window.electronAPI!.parseGoogleSheet({ clientId, clientSecret, tokens, sheetUrl })
  }

  // REST API fallback for browser dev mode
  const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!sheetIdMatch) throw new Error('Invalid Google Sheet URL')

  const sheetId = sheetIdMatch[1]

  // Extract gid from URL to find the correct sheet tab
  const gidMatch = sheetUrl.match(/[?&#]gid=(\d+)/)
  const targetGid = gidMatch ? parseInt(gidMatch[1]) : 0

  // First, get the spreadsheet metadata to find the correct sheet name
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties(sheetId,title))`,
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  )

  if (!metaRes.ok) {
    const err = await metaRes.json()
    throw new Error(err.error?.message || 'Failed to fetch sheet metadata')
  }

  const metaData = await metaRes.json()
  const sheets = metaData.sheets || []

  // Find sheet by gid, fallback to first sheet
  const targetSheet = sheets.find((s: any) => s.properties.sheetId === targetGid)
    || sheets[0]
  const sheetTitle = targetSheet?.properties?.title || 'Sheet1'

  // Now fetch the actual data using the correct sheet name
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetTitle)}`,
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || 'Failed to fetch sheet data')
  }

  const data = await res.json()
  return { rows: data.values || [], sheetTitle }
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const { clientId, clientSecret, tokens } = getGoogleCreds()
  if (!tokens) throw new Error('Not authenticated with Google.')

  if (isElectron()) {
    await window.electronAPI!.sendEmail({ clientId, clientSecret, tokens, to, subject, body })
    return
  }

  // REST API fallback
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n')

  const encodedMessage = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodedMessage }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || 'Failed to send email')
  }
}

export interface CalendarEventParams {
  title: string
  description: string
  startTime: string
  endTime: string
  attendees: string[]
  createMeetLink: boolean
  timeZone?: string
}

export async function createCalendarEvent(event: CalendarEventParams): Promise<{
  eventId: string
  meetLink: string | null
  htmlLink: string
}> {
  const { clientId, clientSecret, tokens } = getGoogleCreds()
  if (!tokens) throw new Error('Not authenticated with Google.')

  if (isElectron()) {
    return window.electronAPI!.createCalendarEvent({ clientId, clientSecret, tokens, event })
  }

  // REST API fallback
  const tz = event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const calendarEvent: any = {
    summary: event.title,
    description: event.description,
    start: { dateTime: event.startTime, timeZone: tz },
    end: { dateTime: event.endTime, timeZone: tz },
    attendees: event.attendees.map(email => ({ email })),
  }

  if (event.createMeetLink) {
    calendarEvent.conferenceData = {
      createRequest: {
        requestId: `hireeasy-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    }
  }

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=${event.createMeetLink ? 1 : 0}&sendUpdates=all`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(calendarEvent),
    }
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || 'Failed to create calendar event')
  }

  const data = await res.json()
  return {
    eventId: data.id,
    meetLink: data.conferenceData?.entryPoints?.[0]?.uri || null,
    htmlLink: data.htmlLink,
  }
}

export async function downloadResume(fileUrl: string): Promise<string> {
  if (isElectron()) {
    return window.electronAPI!.downloadFile(fileUrl)
  }

  const res = await fetch(fileUrl)
  if (!res.ok) {
    throw new Error(`Failed to download resume: ${res.status}`)
  }

  const blob = await res.blob()

  // If it's a PDF, extract text using pdfjs
  if (blob.type === 'application/pdf' || fileUrl.toLowerCase().endsWith('.pdf')) {
    const { extractTextFromPdfBuffer } = await import('./pdfParser')
    const arrayBuffer = await blob.arrayBuffer()
    return extractTextFromPdfBuffer(arrayBuffer)
  }

  // For other file types, return as data URL
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

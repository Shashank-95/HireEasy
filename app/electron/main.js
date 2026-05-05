const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const url = require('url');
const { google } = require('googleapis');
const fs = require('fs');
const { initDatabase } = require('./database');

let mainWindow;
let googleTokens = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0f0f13',
    show: false,
  });

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('open-external', (_, url) => {
  shell.openExternal(url);
});

// ─── Google OAuth ───

function createOAuth2Client(clientId, clientSecret) {
  return new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:8089/oauth2callback');
}

ipcMain.handle('google-auth', async (_, { clientId, clientSecret }) => {
  const oauth2Client = createOAuth2Client(clientId, clientSecret);

  const scopes = [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const query = url.parse(req.url, true).query;
      if (query.code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="background:#0f0f13;color:#fff;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>Authentication Successful</h2><p style="color:#888">You can close this window and return to HireEasy.</p></div></body></html>');

        try {
          const { tokens } = await oauth2Client.getToken(query.code);
          oauth2Client.setCredentials(tokens);
          googleTokens = tokens;

          const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
          const userInfo = await oauth2.userinfo.get();

          server.close();
          resolve({ tokens, email: userInfo.data.email });
        } catch (err) {
          server.close();
          reject(err);
        }
      }
    });

    server.listen(8089, () => {
      shell.openExternal(authUrl);
    });

    setTimeout(() => {
      server.close();
      reject(new Error('Authentication timed out after 2 minutes'));
    }, 120000);
  });
});

// ─── Google Sheets ───

ipcMain.handle('parse-google-sheet', async (_, { clientId, clientSecret, tokens, sheetUrl }) => {
  const oauth2Client = createOAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials(tokens);

  const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!sheetIdMatch) throw new Error('Invalid Google Sheet URL');

  const sheetId = sheetIdMatch[1];
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const firstSheetName = meta.data.sheets[0].properties.title;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: firstSheetName,
  });

  const rows = response.data.values || [];
  if (rows.length === 0) throw new Error('Sheet is empty');

  return { rows, sheetTitle: firstSheetName };
});

// ─── Gmail Send ───

ipcMain.handle('send-email', async (_, { clientId, clientSecret, tokens, to, subject, body }) => {
  const oauth2Client = createOAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials(tokens);

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\r\n');

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });

  return { success: true };
});

// ─── Google Calendar Event ───

ipcMain.handle('create-calendar-event', async (_, { clientId, clientSecret, tokens, event }) => {
  const oauth2Client = createOAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const calendarEvent = {
    summary: event.title,
    description: event.description,
    start: {
      dateTime: event.startTime,
      timeZone: event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: event.endTime,
      timeZone: event.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    attendees: event.attendees.map(email => ({ email })),
    conferenceData: event.createMeetLink ? {
      createRequest: {
        requestId: `hireeasy-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    } : undefined,
  };

  const result = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: calendarEvent,
    conferenceDataVersion: event.createMeetLink ? 1 : 0,
    sendUpdates: 'all',
  });

  return {
    eventId: result.data.id,
    meetLink: result.data.conferenceData?.entryPoints?.[0]?.uri || null,
    htmlLink: result.data.htmlLink,
  };
});

// ─── Google Calendar List Events ───

ipcMain.handle('list-calendar-events', async (_, { clientId, clientSecret, tokens, timeMin, timeMax }) => {
  const oauth2Client = createOAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const result = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = (result.data.items || []).map(item => ({
    start: item.start.dateTime || item.start.date,
    end: item.end.dateTime || item.end.date,
    summary: item.summary || 'Busy',
  }));

  return { events };
});

// ─── File reading (PDF/DOCX) ───

ipcMain.handle('read-file', async (_, filePath) => {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
});

// ─── Download resume from URL ───

ipcMain.handle('download-file', async (_, fileUrl) => {
  const https = require('https');
  const http = require('http');
  const client = fileUrl.startsWith('https') ? https : http;

  return new Promise((resolve, reject) => {
    client.get(fileUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        client.get(res.headers.location, (redirectRes) => {
          const chunks = [];
          redirectRes.on('data', chunk => chunks.push(chunk));
          redirectRes.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
          redirectRes.on('error', reject);
        });
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
      res.on('error', reject);
    }).on('error', reject);
  });
});

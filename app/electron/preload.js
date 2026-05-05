const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  platform: process.platform,

  // Google OAuth
  googleAuth: (params) => ipcRenderer.invoke('google-auth', params),

  // Google Sheets
  parseGoogleSheet: (params) => ipcRenderer.invoke('parse-google-sheet', params),

  // Gmail
  sendEmail: (params) => ipcRenderer.invoke('send-email', params),

  // Google Calendar
  createCalendarEvent: (params) => ipcRenderer.invoke('create-calendar-event', params),
  listCalendarEvents: (params) => ipcRenderer.invoke('list-calendar-events', params),

  // File operations
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  downloadFile: (url) => ipcRenderer.invoke('download-file', url),

  // Database
  dbLoadJobs: () => ipcRenderer.invoke('db-load-jobs'),
  dbSaveJobs: (jobs) => ipcRenderer.invoke('db-save-jobs', jobs),
  dbLoadSettings: () => ipcRenderer.invoke('db-load-settings'),
  dbSaveSettings: (settings) => ipcRenderer.invoke('db-save-settings', settings),
  dbLoadQuestionSets: () => ipcRenderer.invoke('db-load-question-sets'),
  dbSaveQuestionSets: (sets) => ipcRenderer.invoke('db-save-question-sets', sets),
  dbGetPath: () => ipcRenderer.invoke('db-get-path'),
});

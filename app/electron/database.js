const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let db = null;

function getDbPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'hireeasy.db');
}

function getDbJsonPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'hireeasy-data.json');
}

function initDatabase() {
  const dbPath = getDbJsonPath();

  if (fs.existsSync(dbPath)) {
    try {
      const raw = fs.readFileSync(dbPath, 'utf-8');
      db = JSON.parse(raw);
    } catch {
      db = { jobs: [], settings: {}, questionSets: [] };
    }
  } else {
    db = { jobs: [], settings: {}, questionSets: [] };
  }

  setupIpcHandlers();
}

function saveDatabase() {
  const dbPath = getDbJsonPath();
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
}

function setupIpcHandlers() {
  ipcMain.handle('db-load-jobs', async () => {
    return db.jobs;
  });

  ipcMain.handle('db-save-jobs', async (_, jobs) => {
    db.jobs = jobs;
    saveDatabase();
    return { success: true };
  });

  ipcMain.handle('db-load-settings', async () => {
    return db.settings;
  });

  ipcMain.handle('db-save-settings', async (_, settings) => {
    db.settings = settings;
    saveDatabase();
    return { success: true };
  });

  ipcMain.handle('db-load-question-sets', async () => {
    return db.questionSets;
  });

  ipcMain.handle('db-save-question-sets', async (_, sets) => {
    db.questionSets = sets;
    saveDatabase();
    return { success: true };
  });

  ipcMain.handle('db-get-path', async () => {
    return getDbJsonPath();
  });
}

module.exports = { initDatabase };

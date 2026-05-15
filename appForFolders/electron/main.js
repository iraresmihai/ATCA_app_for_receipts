import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createWindow() {
  const win = new BrowserWindow({
    width: 780,
    height: 620,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await win.loadFile(path.join(__dirname, '..', 'index.html'));
}

ipcMain.handle('dialog:pickFolders', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Pick client folders',
    properties: ['openDirectory', 'multiSelections']
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths;
});

ipcMain.handle('dialog:pickDestFolder', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Pick the folder where allPdf.txt should live (its .claude subfolder will be used)',
    properties: ['openDirectory', 'createDirectory']
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0];
});

ipcMain.handle('file:exists', async (_e, p) => {
  try { await fs.access(p); return true; } catch { return false; }
});

ipcMain.handle('file:writeAllPdf', async (_e, destPath, lines) => {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, lines.join('\n') + '\n', 'utf8');
  return true;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

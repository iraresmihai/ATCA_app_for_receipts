import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === 'development';

async function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('dialog:openJson', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Open receipts JSON',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  const jsonPath = r.filePaths[0];
  const text = await fs.readFile(jsonPath, 'utf8');
  return { path: jsonPath, dir: path.dirname(jsonPath), data: JSON.parse(text) };
});

ipcMain.handle('file:readPdf', async (_e, absPath) => {
  const buf = await fs.readFile(absPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

ipcMain.handle('file:saveJson', async (_e, absPath, data) => {
  await fs.writeFile(absPath, JSON.stringify(data, null, 2), 'utf8');
  return true;
});

ipcMain.handle('dialog:pickFolder', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Pick output folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  return r.filePaths[0];
});

ipcMain.handle('file:writeBinary', async (_e, absPath, arrayBuffer) => {
  await fs.writeFile(absPath, Buffer.from(arrayBuffer));
  return true;
});

ipcMain.handle('file:writeText', async (_e, absPath, text) => {
  await fs.writeFile(absPath, text, 'utf8');
  return true;
});

ipcMain.handle('file:readTextIfExists', async (_e, absPath) => {
  try {
    // Try cp1250 first (SAGA exports), fall back to utf-8
    const buf = await fs.readFile(absPath);
    try {
      return new TextDecoder('windows-1250').decode(buf);
    } catch {
      return buf.toString('utf8');
    }
  } catch {
    return null;
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

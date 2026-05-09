import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === 'development';

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await win.loadURL('http://localhost:5174');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'heic', 'heif'];

ipcMain.handle('dialog:pickImages', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Select photos',
    filters: [{ name: 'Images', extensions: IMAGE_EXTS }],
    properties: ['openFile', 'multiSelections']
  });
  if (r.canceled || r.filePaths.length === 0) return [];
  const out = [];
  for (const p of r.filePaths) {
    const buf = await fs.readFile(p);
    out.push({
      path: p,
      name: path.basename(p),
      bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    });
  }
  return out;
});

ipcMain.handle('dialog:savePdf', async (_e, defaultName) => {
  const r = await dialog.showSaveDialog({
    title: 'Save PDF',
    defaultPath: defaultName ?? 'receipts.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (r.canceled || !r.filePath) return null;
  return r.filePath;
});

ipcMain.handle('file:writeBinary', async (_e, absPath, arrayBuffer) => {
  await fs.writeFile(absPath, Buffer.from(arrayBuffer));
  return true;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

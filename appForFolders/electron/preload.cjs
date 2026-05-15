const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  pickFolders: () => ipcRenderer.invoke('dialog:pickFolders'),
  pickDestFolder: () => ipcRenderer.invoke('dialog:pickDestFolder'),
  exists: (p) => ipcRenderer.invoke('file:exists', p),
  writeAllPdf: (dest, lines) => ipcRenderer.invoke('file:writeAllPdf', dest, lines)
});

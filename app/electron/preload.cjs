const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openJson: () => ipcRenderer.invoke('dialog:openJson'),
  readPdf: (absPath) => ipcRenderer.invoke('file:readPdf', absPath),
  saveJson: (absPath, data) => ipcRenderer.invoke('file:saveJson', absPath, data),
  readTextIfExists: (absPath) => ipcRenderer.invoke('file:readTextIfExists', absPath),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  writeBinary: (absPath, ab) => ipcRenderer.invoke('file:writeBinary', absPath, ab),
  writeText: (absPath, text) => ipcRenderer.invoke('file:writeText', absPath, text)
});

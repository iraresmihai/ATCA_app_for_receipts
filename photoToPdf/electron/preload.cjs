const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  pickImages: () => ipcRenderer.invoke('dialog:pickImages'),
  savePdf: (defaultName) => ipcRenderer.invoke('dialog:savePdf', defaultName),
  writeBinary: (absPath, ab) => ipcRenderer.invoke('file:writeBinary', absPath, ab)
});

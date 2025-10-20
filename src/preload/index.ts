import { contextBridge, ipcRenderer } from 'electron';

// Surface a minimal api; expand later for IPC
contextBridge.exposeInMainWorld('studio', {
  version: '0.1.0',
  invoke: (channel: string, args?: unknown) => ipcRenderer.invoke(channel, args)
});

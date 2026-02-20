import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("deepgram", {
  startTranscription: () => ipcRenderer.invoke("start-transcription"),
  stopTranscription: () => ipcRenderer.invoke("stop-transcription"),
  checkPermissions: () => ipcRenderer.invoke("check-permissions"),
  onTranscript: (callback: (event: unknown) => void) => {
    ipcRenderer.on("transcript", (_event, data) => callback(data));
  },
  onError: (callback: (message: string) => void) => {
    ipcRenderer.on("error", (_event, message) => callback(message));
  },
  onStatus: (callback: (status: string) => void) => {
    ipcRenderer.on("status", (_event, status) => callback(status));
  },
});

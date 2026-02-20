/**
 * Electron app example: system audio + mic transcription with renderer display
 *
 * Usage:
 *   DEEPGRAM_API_KEY=your-key npx electron examples/electron-app/main.ts
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { DeepgramElectron } from "../../src/index.js";
import path from "node:path";

let mainWindow: BrowserWindow | null = null;
let dg: DeepgramElectron | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

async function startTranscription() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    mainWindow?.webContents.send("error", "Set DEEPGRAM_API_KEY environment variable");
    return;
  }

  dg = new DeepgramElectron({
    deepgram: {
      apiKey,
      model: "nova-3",
      utterances: true,
      utterance_end_ms: 1000,
    },
    logLevel: "info",
  });

  dg.on("transcript", (event) => {
    mainWindow?.webContents.send("transcript", event);
  });

  dg.on("error", (err) => {
    mainWindow?.webContents.send("error", err.message);
  });

  dg.on("started", () => {
    mainWindow?.webContents.send("status", "running");
  });

  dg.on("stopped", () => {
    mainWindow?.webContents.send("status", "stopped");
  });

  await dg.start();
}

app.whenReady().then(async () => {
  createWindow();

  ipcMain.handle("start-transcription", async () => {
    await startTranscription();
  });

  ipcMain.handle("stop-transcription", async () => {
    await dg?.stop();
    dg = null;
  });

  ipcMain.handle("check-permissions", async () => {
    return DeepgramElectron.checkPermissions();
  });
});

app.on("window-all-closed", async () => {
  await dg?.stop();
  app.quit();
});

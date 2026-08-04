// Arbor Hive Host — preload bridge.
//
// contextIsolation is on and nodeIntegration is off; this is the only
// surface the renderer gets into the main process.

"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hive", {
  getRoster: () => ipcRenderer.invoke("hive:get-roster"),
  getSession: () => ipcRenderer.invoke("hive:get-session"),
  getBoard: (dagId) => ipcRenderer.invoke("hive:get-board", dagId),
  run: (command, args) => ipcRenderer.invoke("hive:run", { command, args }),
  isBusy: () => ipcRenderer.invoke("hive:is-busy"),
  workspaceRoot: () => ipcRenderer.invoke("hive:workspace-root"),
  onLog: (cb) => {
    const listener = (_evt, payload) => cb(payload);
    ipcRenderer.on("hive:log", listener);
    return () => ipcRenderer.removeListener("hive:log", listener);
  },
  onRunDone: (cb) => {
    const listener = (_evt, payload) => cb(payload);
    ipcRenderer.on("hive:run-done", listener);
    return () => ipcRenderer.removeListener("hive:run-done", listener);
  },
});

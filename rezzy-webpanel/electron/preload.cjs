const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rezvix", {
  ping: () => "pong",

  // 🔄 Auto update
  onUpdateAvailable: (cb) =>
    ipcRenderer.on("update:available", cb),

  onUpdateReady: (cb) =>
    ipcRenderer.on("update:ready", cb),

  installUpdate: () =>
    ipcRenderer.invoke("update:install"),
});
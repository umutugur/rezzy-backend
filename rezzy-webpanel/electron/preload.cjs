const { contextBridge } = require("electron");

// Şimdilik boş API, ileride yazıcı/auto-update/local FS vs ekleriz.
contextBridge.exposeInMainWorld("rezvix", {
  ping: () => "pong",
});
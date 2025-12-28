const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

autoUpdater.autoDownload = true;

autoUpdater.on("update-available", () => {
  mainWindow?.webContents.send("update:available");
});

autoUpdater.on("update-downloaded", () => {
  mainWindow?.webContents.send("update:ready");
});

// Renderer’dan restart isteği
ipcMain.handle("update:install", () => {
  autoUpdater.quitAndInstall();
});
let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow = win;

  // PROD
  win.loadURL("https://rezzywebpanel.onrender.com/#/restaurant-desktop/tables");

  // ✅ Auto-update (sadece packaged iken)
  if (app.isPackaged) {
    // küçük gecikme: ilk açılış UI bloklanmasın
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 1500);

    // İstersen periyodik kontrol (ör. 6 saatte bir)
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify();
    }, 6 * 60 * 60 * 1000);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
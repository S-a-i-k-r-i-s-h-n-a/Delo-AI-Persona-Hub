const { app, BrowserWindow } = require('electron');
const path = require('path');

try {
  require('electron-reloader')(module, {
    ignore: ['node_modules', '.git']
  });
} catch (_) {}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#050810',
      symbolColor: '#ffffff',
      height: 35
    },
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  win.setMenuBarVisibility(false);

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
